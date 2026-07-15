const test = require("node:test");
const assert = require("node:assert/strict");

const {
  purgeEmailLogBodies,
  anonymizeOldEmailLogMetadata,
} = require("../../services/privacy/purgeEmailLogBodies");

test("purgeEmailLogBodies clears old body fields", async () => {
  const originalUpdate = require("../../models").EmailLog.update;
  let capturedUpdate = null;

  require("../../models").EmailLog.update = async (values, options) => {
    capturedUpdate = { values, options };
    return [3];
  };

  try {
    const result = await purgeEmailLogBodies({ days: 90 });
    assert.equal(result.purgedCount, 3);
    assert.equal(result.thresholdDays, 90);
    assert.equal(capturedUpdate.values.bodyText, null);
    assert.equal(capturedUpdate.values.bodyHtml, null);
    assert.equal(capturedUpdate.values.attachmentMeta, null);
  } finally {
    require("../../models").EmailLog.update = originalUpdate;
  }
});

test("anonymizeOldEmailLogMetadata redacts recipient metadata", async () => {
  const originalUpdate = require("../../models").EmailLog.update;
  let capturedUpdate = null;

  require("../../models").EmailLog.update = async (values, options) => {
    capturedUpdate = { values, options };
    return [2];
  };

  try {
    const result = await anonymizeOldEmailLogMetadata({ days: 730 });
    assert.equal(result.anonymizedCount, 2);
    assert.equal(result.thresholdDays, 730);
    assert.equal(capturedUpdate.values.toAddress, "[ANONYMIZED]");
    assert.equal(capturedUpdate.values.subject, "[ANONYMIZED]");
  } finally {
    require("../../models").EmailLog.update = originalUpdate;
  }
});
