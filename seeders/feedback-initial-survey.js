"use strict";

const SURVEY_ID = "a1000000-0000-4000-8000-000000000001";
const Q1_ID = "b1000000-0000-4000-8000-000000000001";
const Q2_ID = "b1000000-0000-4000-8000-000000000002";
const Q3_ID = "b1000000-0000-4000-8000-000000000003";
const Q4_ID = "b1000000-0000-4000-8000-000000000004";
const RULE1_ID = "c1000000-0000-4000-8000-000000000001";
const RULE2_ID = "c1000000-0000-4000-8000-000000000002";

const now = new Date();

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("feedback_surveys", [
      {
        id: SURVEY_ID,
        title: "Fahrt-Feedback",
        description: "Feedback nach einer Fahrt mit der Grünen Flotte",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert("feedback_questions", [
      {
        id: Q1_ID,
        survey_id: SURVEY_ID,
        question_text: "Was hat nicht geklappt?",
        type: "multi_choice",
        options: JSON.stringify([
          "Fahrzeugzustand",
          "Buchungsprozess",
          "Fahrzeug nicht auffindbar",
          "Technisches Problem",
          "Sonstiges",
        ]),
        is_required: true,
        order_index: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: Q2_ID,
        survey_id: SURVEY_ID,
        question_text: "Wie schwerwiegend war das Problem?",
        type: "single_choice",
        options: JSON.stringify([
          "Ärgerlich",
          "Hat die Fahrt beeinträchtigt",
          "Fahrt war nicht möglich",
        ]),
        is_required: true,
        order_index: 2,
        created_at: now,
        updated_at: now,
      },
      {
        id: Q3_ID,
        survey_id: SURVEY_ID,
        question_text: "Was ist konkret passiert?",
        type: "text",
        options: null,
        is_required: false,
        order_index: 3,
        created_at: now,
        updated_at: now,
      },
      {
        id: Q4_ID,
        survey_id: SURVEY_ID,
        question_text: "Darf unser Team dich kontaktieren?",
        type: "single_choice",
        options: JSON.stringify(["Ja, gerne", "Nein danke"]),
        is_required: true,
        order_index: 4,
        created_at: now,
        updated_at: now,
      },
    ]);

    const supportEmail =
      process.env.FEEDBACK_SUPPORT_EMAIL || "support@yourcompany.com";

    await queryInterface.bulkInsert("feedback_trigger_rules", [
      {
        id: RULE1_ID,
        survey_id: SURVEY_ID,
        question_id: Q2_ID,
        operator: "equals",
        value: "Fahrt war nicht möglich",
        action_type: "email",
        action_config: JSON.stringify({
          to: supportEmail,
          subject: "🚨 Kritisch: Fahrt nicht möglich",
        }),
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: RULE2_ID,
        survey_id: SURVEY_ID,
        question_id: Q2_ID,
        operator: "equals",
        value: "Hat die Fahrt beeinträchtigt",
        action_type: "db_flag",
        action_config: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("feedback_trigger_rules", {
      id: [RULE1_ID, RULE2_ID],
    });
    await queryInterface.bulkDelete("feedback_questions", {
      id: [Q1_ID, Q2_ID, Q3_ID, Q4_ID],
    });
    await queryInterface.bulkDelete("feedback_surveys", { id: SURVEY_ID });
  },
};
