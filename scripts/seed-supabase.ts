/**
 * Seeds a Supabase project with the component catalogue and the Beast Topics learning content.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
 *
 * The service-role key bypasses RLS: keep it on your machine / CI only — never put it in NEXT_PUBLIC_* variables.
 * Quiz answer keys go into quiz_answer_keys, which students cannot read (grading happens in submit_quiz()).
 */
import { createClient } from "@supabase/supabase-js";
import { CATALOGUE } from "../src/lib/catalogue";
import { LEARNING_PATHS, QUIZZES, TOPICS, WEEKLY_MISSIONS_DEFAULT } from "../src/lib/learning";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role, server-side only).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function upsert(table: string, rows: object[], chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`✓ ${table}: ${rows.length}`);
}

async function main() {
  await upsert(
    "components",
    CATALOGUE.map((c) => ({
      id: c.id, name: c.name, category: c.category, category_number: c.categoryNumber, subcategory: c.subcategory, manufacturer: c.manufacturer, model: c.model,
      description: c.description, functionality_class: c.functionalityClass, kind: c.kind, sim_status: c.simStatus, verification: c.verification,
      image_url: c.image, model3d_url: c.model3d, footprint2d_url: c.footprint2d, datasheet_url: c.datasheetUrl, pinout_status: c.pinoutStatus,
      competitions: c.competitions, options: c.options, sim_params: { motor: c.motor, driver: c.driver, battery: c.battery, sensor: c.sensor, wheel: c.wheel, chassis: c.chassis, board: c.board },
      sources: c.sources, cross_listed_with: c.crossListedWith, tags: c.tags,
    })),
  );
  await upsert(
    "component_pins",
    CATALOGUE.flatMap((c) => c.pins.map((p) => ({ component_id: c.id, pin_id: p.id, label: p.label, fn: p.fn, side: p.side, caps: p.caps ?? [], arduino_pin: p.arduinoPin ?? null, v_min: p.vRange?.[0] ?? null, v_max: p.vRange?.[1] ?? null, v_out: p.vOut ?? null, i_max_ma: p.iMax_mA ?? null, logic_v: p.logicV ?? null, note: p.note ?? null }))),
    500,
  );
  await upsert(
    "component_specifications",
    CATALOGUE.map((c) => ({ component_id: c.id, voltage: c.specs.voltage ?? null, logic_voltage: c.specs.logicVoltage ?? null, current: c.specs.current ?? null, power: c.specs.power ?? null, protocols: c.specs.protocols ?? null, dimensions: c.specs.dimensions ?? null, weight_g: c.specs.weight_g ?? null, extra: c.specs.extra ?? null, bridges: c.bridges, compatible_with: c.compatibleWith, compatible_controllers: c.compatibleControllers, compatible_drivers: c.compatibleDrivers, mounting_points: c.mountingPoints })),
  );
  await upsert("learning_paths", LEARNING_PATHS.map((p, i) => ({ id: p.id, title: p.title, tagline: p.tagline, description: p.description, sort: i })));
  await upsert("topics", TOPICS.map((t) => ({ id: t.id, path_id: t.pathId, sort: t.order, title: t.title, summary: t.summary, minutes: t.minutes })));
  await upsert("lessons", TOPICS.map((t) => ({ topic_id: t.id, content: { ...t, quiz: undefined } })));
  const questions = TOPICS.flatMap((t) => t.quiz.map((q) => ({ q, topicId: t.id })));
  await upsert("quiz_questions", questions.map(({ q, topicId }) => ({ id: q.id, topic_id: topicId, type: q.type, prompt: q.prompt, code: q.code ?? null, diagram: q.diagram ?? null, options: q.options, explanation: q.explanation, difficulty: q.difficulty, xp: q.xp })));
  await upsert("quiz_answer_keys", questions.map(({ q }) => ({ question_id: q.id, answer_index: q.answerIndex })));
  await upsert("quizzes", QUIZZES.map((q) => ({ id: q.id, title: q.title, kind: q.kind, path_id: q.pathId ?? null, pass_percent: q.passPercent, xp_bonus: q.xpBonus, time_limit_s: q.timeLimitS ?? null })));
  await upsert("quiz_membership", QUIZZES.flatMap((q) => q.questionIds.map((id) => ({ quiz_id: q.id, question_id: id }))));
  await upsert("weekly_missions", WEEKLY_MISSIONS_DEFAULT.map((m, i) => ({ day: m.day, title: m.title, description: m.description, topic_ids: m.topicIds, sort: i })));
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
