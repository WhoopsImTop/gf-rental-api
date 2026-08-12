"use strict";

const db = require("../models");

const VALID_JOB_STATUSES = new Set([
  "pending",
  "processing",
  "sent",
  "cancelled",
  "failed",
]);

const VALID_TRIGGER_EVENTS = new Set(["cart_user_attached"]);
const VALID_TIMING_TYPES = new Set(["after_event"]);
const VALID_CANCEL_CONDITIONS = new Set([
  "cart_completed",
  "car_unavailable",
]);
const KEY_PATTERN = /^[a-z0-9_]+$/;

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeCancelConditions(value) {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) {
    return { error: "cancel_conditions must be an array" };
  }
  const normalized = [];
  for (const item of value) {
    const condition = String(item);
    if (!VALID_CANCEL_CONDITIONS.has(condition)) {
      return {
        error: `Invalid cancel_condition: ${condition}`,
      };
    }
    if (!normalized.includes(condition)) {
      normalized.push(condition);
    }
  }
  return { value: normalized };
}

function validateRulePayload(body, { isCreate }) {
  const errors = [];
  const data = {};

  if (isCreate) {
    const key = String(body.key ?? "").trim();
    if (!key) {
      errors.push("key is required");
    } else if (!KEY_PATTERN.test(key)) {
      errors.push("key must match ^[a-z0-9_]+$");
    } else if (key.length > 64) {
      errors.push("key must be at most 64 characters");
    } else {
      data.key = key;
    }
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    errors.push("name is required");
  } else {
    data.name = name.slice(0, 255);
  }

  const subject = String(body.subject ?? "").trim();
  if (!subject) {
    errors.push("subject is required");
  } else {
    data.subject = subject.slice(0, 512);
  }

  const bodyHtml = String(body.body_html ?? "").trim();
  if (!bodyHtml) {
    errors.push("body_html is required");
  } else {
    data.body_html = bodyHtml;
  }

  const triggerEvent = String(
    body.trigger_event ?? "cart_user_attached",
  ).trim();
  if (!VALID_TRIGGER_EVENTS.has(triggerEvent)) {
    errors.push("trigger_event is invalid");
  } else {
    data.trigger_event = triggerEvent;
  }

  const timingType = String(body.timing_type ?? "after_event").trim();
  if (!VALID_TIMING_TYPES.has(timingType)) {
    errors.push("timing_type is invalid (only after_event supported)");
  } else {
    data.timing_type = timingType;
  }

  const delayMinutes = Number.parseInt(String(body.delay_minutes ?? ""), 10);
  if (!Number.isFinite(delayMinutes) || delayMinutes < 1) {
    errors.push("delay_minutes must be an integer >= 1");
  } else {
    data.delay_minutes = delayMinutes;
  }

  data.anchor_field = null;

  const cancelResult = normalizeCancelConditions(
    body.cancel_conditions ?? ["cart_completed"],
  );
  if (cancelResult.error) {
    errors.push(cancelResult.error);
  } else {
    data.cancel_conditions = cancelResult.value;
  }

  if (body.is_active === undefined || body.is_active === null) {
    data.is_active = true;
  } else if (typeof body.is_active === "boolean") {
    data.is_active = body.is_active;
  } else if (
    body.is_active === "true" ||
    body.is_active === 1 ||
    body.is_active === "1"
  ) {
    data.is_active = true;
  } else if (
    body.is_active === "false" ||
    body.is_active === 0 ||
    body.is_active === "0"
  ) {
    data.is_active = false;
  } else {
    errors.push("is_active must be a boolean");
  }

  return { errors, data };
}

exports.listFollowupJobs = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 1000);
    const limit = parsePositiveInt(req.query.limit, 25, 100);
    const offset = (page - 1) * limit;
    const { Op } = db.Sequelize;

    const where = {};

    if (req.query.status && VALID_JOB_STATUSES.has(String(req.query.status))) {
      where.status = String(req.query.status);
    }

    const ruleWhere = {};
    if (req.query.ruleKey) {
      ruleWhere.key = String(req.query.ruleKey);
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      const or = [
        { cancel_reason: like },
        { error_message: like },
        { "$rule.name$": like },
        { "$rule.key$": like },
      ];
      const asCartId = Number.parseInt(search, 10);
      if (Number.isFinite(asCartId) && asCartId > 0) {
        or.push({ cart_id: asCartId });
      }
      where[Op.or] = or;
    }

    const { rows, count } = await db.FollowupJob.findAndCountAll({
      where,
      include: [
        {
          model: db.FollowupRule,
          as: "rule",
          attributes: ["id", "key", "name"],
          where: Object.keys(ruleWhere).length ? ruleWhere : undefined,
          required: Boolean(Object.keys(ruleWhere).length) || Boolean(search),
        },
        {
          model: db.User,
          as: "user",
          attributes: ["id", "email", "firstName", "lastName"],
          required: false,
        },
        {
          model: db.Cart,
          as: "cart",
          attributes: ["id", "accessToken", "completed", "carAboId"],
          required: false,
        },
      ],
      order: [["send_at", "ASC"]],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    return res.status(200).json({
      jobs: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.max(1, Math.ceil(count / limit)),
      },
    });
  } catch (error) {
    console.error("listFollowupJobs failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.cancelFollowupJob = async (req, res) => {
  try {
    const job = await db.FollowupJob.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Follow-up job not found" });
    }

    if (job.status !== "pending" && job.status !== "processing") {
      return res.status(400).json({
        error: "Only pending or processing jobs can be cancelled",
        status: job.status,
      });
    }

    await job.update({
      status: "cancelled",
      cancel_reason: "manual",
    });

    return res.status(200).json({ job });
  } catch (error) {
    console.error("cancelFollowupJob failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.listFollowupRules = async (req, res) => {
  try {
    const rules = await db.FollowupRule.findAll({
      order: [["key", "ASC"]],
    });
    return res.status(200).json({ rules });
  } catch (error) {
    console.error("listFollowupRules failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getFollowupRuleById = async (req, res) => {
  try {
    const rule = await db.FollowupRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Follow-up rule not found" });
    }
    return res.status(200).json({ rule });
  } catch (error) {
    console.error("getFollowupRuleById failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.createFollowupRule = async (req, res) => {
  try {
    const { errors, data } = validateRulePayload(req.body || {}, {
      isCreate: true,
    });
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    const existing = await db.FollowupRule.findOne({
      where: { key: data.key },
    });
    if (existing) {
      return res.status(400).json({ error: "key already exists" });
    }

    const rule = await db.FollowupRule.create(data);
    return res.status(201).json({ rule });
  } catch (error) {
    console.error("createFollowupRule failed:", error);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "key already exists" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateFollowupRule = async (req, res) => {
  try {
    const rule = await db.FollowupRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Follow-up rule not found" });
    }

    const { errors, data } = validateRulePayload(req.body || {}, {
      isCreate: false,
    });
    if (errors.length) {
      return res.status(400).json({ error: errors.join("; ") });
    }

    // key is immutable — ignore if sent
    await rule.update(data);
    return res.status(200).json({ rule });
  } catch (error) {
    console.error("updateFollowupRule failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports._internals = {
  validateRulePayload,
  normalizeCancelConditions,
  VALID_TRIGGER_EVENTS,
  VALID_TIMING_TYPES,
  VALID_CANCEL_CONDITIONS,
  KEY_PATTERN,
};
