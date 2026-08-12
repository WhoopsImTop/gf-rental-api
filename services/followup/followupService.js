"use strict";

const handlebars = require("handlebars");
const db = require("../../models");
const mailService = require("../mailService");
const { escapeHtml } = require("../util/escapeHtml");

const TRIGGER_CART_USER_ATTACHED = "cart_user_attached";

function getCheckoutBaseUrl() {
  const appUrl =
    process.env.FOLLOWUP_CHECKOUT_BASE_URL ||
    process.env.APPURL ||
    process.env.SITEMAP_FRONTEND_BASE_URL ||
    "http://localhost:3002/auto-abo";
  return String(appUrl).replace(/\/$/, "");
}

function buildCheckoutUrl(accessToken) {
  const token = encodeURIComponent(String(accessToken || "").trim());
  return `${getCheckoutBaseUrl()}/checkout?t=${token}`;
}

function resolveCarName(cart) {
  const car = cart?.car;
  if (!car) return "dein Auto Abo";
  if (car.displayName) return String(car.displayName);
  const brandName = car.Brand?.name || car.brand?.name || "";
  const model = car.model || "";
  const combined = `${brandName} ${model}`.trim();
  return combined || "dein Auto Abo";
}

function resolveCarImageUrl(cart) {
  const url = cart?.color?.media?.url;
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return trimmed || null;
}

function buildCarImageHtml(imageUrl, carName) {
  if (!imageUrl) return "";
  const html = `<img src="${escapeHtml(imageUrl)}" width="100%" height="auto" alt="${escapeHtml(carName)}" style="display:block;margin:0 0 16px 0;border:0;max-width:100%;"/>`;
  // SafeString so {{carImage}} in templates is not HTML-escaped by Handlebars.
  return new handlebars.SafeString(html);
}

/** Nameless OTP users get a neutral greeting token. */
function resolveFirstName(user) {
  const name = String(user?.firstName || "").trim();
  return name || "";
}

function resolveRecipient(job) {
  const fromUser = job?.user?.email ? String(job.user.email).trim() : "";
  if (fromUser) return { email: fromUser, userId: job.user.id || null };
  const fromJob = job?.to_email ? String(job.to_email).trim() : "";
  if (fromJob) return { email: fromJob, userId: job.user_id || null };
  return { email: null, userId: null };
}

function renderTemplate(template, vars) {
  return handlebars.compile(String(template || ""))(vars);
}

/**
 * Schedule follow-up jobs for a cart.
 * Supports OTP-only leads: pass `email` when cart has no userId yet.
 */
async function scheduleForCart(
  cartId,
  { triggerEvent = TRIGGER_CART_USER_ATTACHED, email = null } = {},
) {
  if (!cartId) return { created: 0 };

  const cart = await db.Cart.findByPk(cartId);
  if (!cart || cart.completed) {
    return { created: 0 };
  }

  const normalizedEmail =
    typeof email === "string" && email.includes("@")
      ? email.trim().toLowerCase()
      : null;

  if (!cart.userId && !normalizedEmail) {
    return { created: 0 };
  }

  const rules = await db.FollowupRule.findAll({
    where: {
      trigger_event: triggerEvent,
      is_active: true,
      timing_type: "after_event",
    },
  });

  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const rule of rules) {
    const delayMinutes = Number(rule.delay_minutes) || 0;
    const sendAt = new Date(now + delayMinutes * 60 * 1000);

    let existingAny = await db.FollowupJob.findOne({
      where: {
        rule_id: rule.id,
        cart_id: cart.id,
      },
    });

    if (existingAny && existingAny.status !== "pending") {
      const previousEmail = existingAny.to_email
        ? String(existingAny.to_email).trim().toLowerCase()
        : null;
      const recipientChanged =
        (cart.userId && existingAny.user_id !== cart.userId) ||
        (normalizedEmail && previousEmail && previousEmail !== normalizedEmail) ||
        (normalizedEmail && !previousEmail && cart.userId && existingAny.user_id !== cart.userId);

      // Cart reused by a new OTP lead → free the unique slot and reschedule
      if (recipientChanged) {
        await existingAny.destroy();
        existingAny = null;
      }
    }

    if (!existingAny) {
      await db.FollowupJob.create({
        rule_id: rule.id,
        cart_id: cart.id,
        user_id: cart.userId || null,
        to_email: normalizedEmail,
        car_abo_id: cart.carAboId || null,
        send_at: sendAt,
        status: "pending",
      });
      created += 1;
      continue;
    }

    if (existingAny.status !== "pending") {
      continue;
    }

    const patch = {};
    if (cart.userId && existingAny.user_id !== cart.userId) {
      patch.user_id = cart.userId;
    }
    if (normalizedEmail && existingAny.to_email !== normalizedEmail) {
      patch.to_email = normalizedEmail;
    }
    if (cart.carAboId && existingAny.car_abo_id !== cart.carAboId) {
      patch.car_abo_id = cart.carAboId;
    }
    if (Object.keys(patch).length > 0) {
      patch.send_at = sendAt;
      await existingAny.update(patch);
      updated += 1;
    }
  }

  return { created, updated };
}

async function attachUserToCartJobs(cartId, userId, { transaction } = {}) {
  if (!cartId || !userId) return { updated: 0 };

  const [updated] = await db.FollowupJob.update(
    { user_id: userId },
    {
      where: {
        cart_id: cartId,
        status: "pending",
      },
      transaction,
    },
  );

  return { updated };
}

async function cancelForCart(cartId, reason, { transaction } = {}) {
  if (!cartId) return { cancelled: 0 };

  const [cancelled] = await db.FollowupJob.update(
    {
      status: "cancelled",
      cancel_reason: reason || "cancelled",
    },
    {
      where: {
        cart_id: cartId,
        status: "pending",
      },
      transaction,
    },
  );

  return { cancelled };
}

function evaluateCancelReason(rule, cart) {
  const conditions = Array.isArray(rule?.cancel_conditions)
    ? rule.cancel_conditions
    : [];

  if (!cart || cart.completed) {
    return "cart_completed";
  }

  if (conditions.includes("car_unavailable")) {
    const car = cart.car;
    const color = cart.color;
    const carUnavailable =
      !car ||
      car.status !== "available" ||
      (color && color.isOrdered === true);
    if (carUnavailable) {
      return "car_unavailable";
    }
  }

  return null;
}

async function loadJobContext(job) {
  const fullJob = await db.FollowupJob.findByPk(job.id, {
    include: [
      { model: db.FollowupRule, as: "rule" },
      {
        model: db.Cart,
        as: "cart",
        include: [
          {
            model: db.CarAbo,
            as: "car",
            include: [{ model: db.Brand }],
          },
          { model: db.CarAboColor, as: "color", include: [{ model: db.Media, as: "media" }] },
        ],
      },
      { model: db.User, as: "user", required: false },
    ],
  });
  return fullJob;
}

async function markCancelled(jobId, reason) {
  await db.FollowupJob.update(
    {
      status: "cancelled",
      cancel_reason: reason,
    },
    { where: { id: jobId, status: "processing" } },
  );
}

async function processSingleJob(job) {
  const [claimed] = await db.FollowupJob.update(
    { status: "processing" },
    { where: { id: job.id, status: "pending" } },
  );

  if (claimed === 0) {
    return { status: "skipped" };
  }

  try {
    const fullJob = await loadJobContext(job);
    if (!fullJob?.rule) {
      await markCancelled(job.id, "rule_missing");
      return { status: "cancelled", reason: "rule_missing" };
    }

    const cancelReason = evaluateCancelReason(fullJob.rule, fullJob.cart);
    if (cancelReason) {
      await markCancelled(job.id, cancelReason);
      return { status: "cancelled", reason: cancelReason };
    }

    const cart = fullJob.cart;
    const { email: recipientEmail, userId } = resolveRecipient(fullJob);

    if (!recipientEmail || !cart?.accessToken) {
      await markCancelled(job.id, "missing_recipient");
      return { status: "cancelled", reason: "missing_recipient" };
    }

    const firstName = resolveFirstName(fullJob.user);
    const carName = resolveCarName(cart);
    const carImageUrl = resolveCarImageUrl(cart);
    const carImage = buildCarImageHtml(carImageUrl, carName);
    const checkoutUrl = buildCheckoutUrl(cart.accessToken);
    const templateVars = {
      firstName: escapeHtml(firstName),
      carName: escapeHtml(carName),
      carImage,
      carImageUrl: carImageUrl ? escapeHtml(carImageUrl) : "",
      checkoutUrl,
    };

    const subject = renderTemplate(fullJob.rule.subject, {
      firstName,
      carName,
      checkoutUrl,
    });
    let bodyInner = renderTemplate(fullJob.rule.body_html, templateVars);
    // Existing templates without {{carImage}} still get the vehicle photo.
    if (carImage && !String(fullJob.rule.body_html || "").includes("{{carImage}}")) {
      bodyInner = `${carImage.toString()}${bodyInner}`;
    }
    const html = mailService.generateEmailHtml(subject, bodyInner);

    const sent = await mailService.sendNotificationEmail(
      recipientEmail,
      null,
      subject,
      html,
      null,
      {
        mailType: "followup",
        context: { relatedUserId: userId },
      },
    );

    if (!sent) {
      await db.FollowupJob.update(
        {
          status: "failed",
          error_message: "sendNotificationEmail returned false",
        },
        { where: { id: job.id, status: "processing" } },
      );
      return { status: "failed" };
    }

    await db.FollowupJob.update(
      {
        status: "sent",
        sent_at: new Date(),
        error_message: null,
      },
      { where: { id: job.id, status: "processing" } },
    );

    return { status: "sent" };
  } catch (error) {
    await db.FollowupJob.update(
      {
        status: "failed",
        error_message: error.message || String(error),
      },
      { where: { id: job.id, status: "processing" } },
    );
    return { status: "failed", error };
  }
}

async function processDueJobs({ limit = 50, now = new Date() } = {}) {
  const { Op } = db.Sequelize;

  const dueJobs = await db.FollowupJob.findAll({
    where: {
      status: "pending",
      send_at: { [Op.lte]: now },
    },
    order: [["send_at", "ASC"]],
    limit,
  });

  const summary = {
    checked: dueJobs.length,
    sent: 0,
    cancelled: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of dueJobs) {
    const result = await processSingleJob(job);
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "cancelled") summary.cancelled += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }

  return summary;
}

module.exports = {
  TRIGGER_CART_USER_ATTACHED,
  scheduleForCart,
  attachUserToCartJobs,
  cancelForCart,
  processDueJobs,
  processSingleJob,
  evaluateCancelReason,
  buildCheckoutUrl,
  getCheckoutBaseUrl,
  resolveCarName,
  resolveCarImageUrl,
  buildCarImageHtml,
  resolveFirstName,
  resolveRecipient,
};
