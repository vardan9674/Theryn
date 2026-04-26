import { supabase } from "../lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoutineTemplate {
  id: string;
  owner_coach_id: string;
  name: string;
  description?: string;
  category?: string;
  version: number;
  visibility: "private" | "unlisted" | "public";
  price_cents?: number;
  published_at?: string;
  forked_from_template_id?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface TemplateDay {
  id?: string;
  day_index: number;
  workout_type: string;
  label: string;
  exercises: TemplateExercise[];
}

export interface TemplateExercise {
  id?: string;
  template_day_id?: string;
  sort_order: number;
  exercise_name: string;
  muscle_group?: string;
  equipment?: string;
  category?: string;
  source_exercise_id?: string;
  source_user_exercise_id?: string;
  target_sets: number;
  target_reps: string;
  notes?: string;
}

export interface TemplateAssignment {
  id: string;
  template_id: string;
  athlete_id: string;
  coach_id: string;
  athlete_name?: string;
  assigned_at: string;
  last_pushed_version: number;
  is_overridden: boolean;
  overridden_at?: string;
  unassigned_at?: string;
}

export interface PushResult {
  succeeded: string[];
  skipped_overridden: string[];
  skipped_mid_week: string[];
  active_session_conflicts: string[];
  failed: Array<{ athlete_id: string; reason: string }>;
}

export interface AssignResult {
  succeeded: string[];
  failed: Array<{ athlete_id: string; reason: string }>;
  archived: string[];
}

// ── Template CRUD ─────────────────────────────────────────────────────────────

export async function listTemplates(coachId: string): Promise<(RoutineTemplate & { assignment_count: number })[]> {
  const { data, error } = await supabase
    .from("routine_templates")
    .select("*")
    .eq("owner_coach_id", coachId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const templates = data || [];

  // Fetch assignment counts in one query
  if (templates.length === 0) return [];

  const ids = templates.map((t: any) => t.id);
  const { data: counts } = await supabase
    .from("routine_template_assignments")
    .select("template_id")
    .in("template_id", ids)
    .is("unassigned_at", null);

  const countMap: Record<string, number> = {};
  for (const row of counts || []) {
    countMap[(row as any).template_id] = (countMap[(row as any).template_id] || 0) + 1;
  }

  return templates.map((t: any) => ({ ...t, assignment_count: countMap[t.id] || 0 }));
}

export async function createTemplate(coachId: string, name: string): Promise<RoutineTemplate> {
  const { data, error } = await supabase
    .from("routine_templates")
    .insert({ owner_coach_id: coachId, name })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message || "Failed to create template");
  return data as RoutineTemplate;
}

export async function getTemplateWithTree(templateId: string): Promise<{ template: RoutineTemplate; days: TemplateDay[] }> {
  const { data: template, error: tErr } = await supabase
    .from("routine_templates")
    .select("*")
    .eq("id", templateId)
    .is("deleted_at", null)
    .single();

  if (tErr || !template) throw new Error(tErr?.message || "Template not found");

  const { data: days, error: dErr } = await supabase
    .from("routine_template_days")
    .select("*, routine_template_exercises(*)")
    .eq("template_id", templateId)
    .order("day_index");

  if (dErr) throw new Error(dErr.message);

  const parsedDays: TemplateDay[] = (days || []).map((d: any) => ({
    id: d.id,
    day_index: d.day_index,
    workout_type: d.workout_type,
    label: d.label,
    exercises: ((d.routine_template_exercises || []) as TemplateExercise[])
      .sort((a, b) => a.sort_order - b.sort_order),
  }));

  return { template: template as RoutineTemplate, days: parsedDays };
}

export async function updateTemplateName(templateId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("routine_templates")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw new Error(error.message);
}

/**
 * Full tree save: replaces all days + exercises for the template, then bumps version.
 * Days with day_index not in the new list are implicitly removed (no orphan rows).
 */
export async function saveTemplateTree(templateId: string, days: TemplateDay[]): Promise<number> {
  // Validate: must have at least one day with at least one exercise
  const hasContent = days.some(d => d.workout_type !== "Rest" && d.exercises.length > 0);
  if (!hasContent) throw new Error("Template must have at least one day with exercises");

  // 1. Delete all existing days (cascade deletes exercises)
  const { error: delErr } = await supabase
    .from("routine_template_days")
    .delete()
    .eq("template_id", templateId);
  if (delErr) throw new Error(delErr.message);

  // 2. Re-insert days + exercises
  for (const day of days) {
    const { data: dayRow, error: dayErr } = await supabase
      .from("routine_template_days")
      .insert({
        template_id: templateId,
        day_index: day.day_index,
        workout_type: day.workout_type,
        label: day.label,
      })
      .select("id")
      .single();

    if (dayErr || !dayRow) continue;

    if (day.exercises.length > 0) {
      const exRows = day.exercises.map((ex: any, i) => ({
        template_day_id: dayRow.id,
        sort_order: i,
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group || null,
        equipment: ex.equipment || null,
        category: ex.category || null,
        source_exercise_id: ex.source_exercise_id || null,
        source_user_exercise_id: ex.source_user_exercise_id || null,
        target_sets: ex.target_sets ?? 3,
        target_reps: ex.target_reps ?? "8-12",
        notes: ex.notes || null,
      }));

      const { error: exErr } = await supabase
        .from("routine_template_exercises")
        .insert(exRows);

      if (exErr) console.error("Failed inserting template exercises:", exErr.message);
    }
  }

  // 3. Bump version (single UPDATE after full tree is written)
  const { data: updated, error: vErr } = await supabase
    .from("routine_templates")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .select("version")
    .single();

  if (vErr) throw new Error(vErr.message);

  // Increment version manually (trigger only updates updated_at, version bumped here)
  const nextVersion = ((updated as any)?.version || 1) + 1;
  await supabase
    .from("routine_templates")
    .update({ version: nextVersion })
    .eq("id", templateId);

  return nextVersion;
}

export async function duplicateTemplate(templateId: string, newName: string, coachId: string): Promise<RoutineTemplate> {
  const { template, days } = await getTemplateWithTree(templateId);

  const newTemplate = await createTemplate(coachId, newName);

  // Save the tree into the new template
  await saveTemplateTree(newTemplate.id, days);

  // Mark it as forked
  await supabase
    .from("routine_templates")
    .update({ forked_from_template_id: templateId })
    .eq("id", newTemplate.id);

  return newTemplate;
}

export async function softDeleteTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.rpc("soft_delete_template", { p_template_id: templateId });
  if (error) throw new Error(error.message);
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function assignTemplate(templateId: string, athleteIds: string[]): Promise<AssignResult> {
  const { data, error } = await supabase.rpc("assign_template", {
    p_template_id: templateId,
    p_athlete_ids: athleteIds,
  });
  if (error) throw new Error(error.message);
  return data as AssignResult;
}

export async function pushTemplateUpdate(
  templateId: string,
  athleteIds: string[] | null,
  options: { force?: boolean; skipMidWeek?: boolean } = {}
): Promise<PushResult> {
  const { data, error } = await supabase.rpc("push_template_update", {
    p_template_id:   templateId,
    p_athlete_ids:   athleteIds,
    p_force:         options.force ?? false,
    p_skip_mid_week: options.skipMidWeek ?? true,
  });
  if (error) throw new Error(error.message);
  return data as PushResult;
}

export async function unassignTemplate(templateId: string, athleteIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("unassign_template", {
    p_template_id: templateId,
    p_athlete_ids: athleteIds,
  });
  if (error) throw new Error(error.message);
}

export async function resetAthleteToTemplate(templateId: string, athleteId: string): Promise<PushResult> {
  const { data, error } = await supabase.rpc("reset_athlete_to_template", {
    p_template_id: templateId,
    p_athlete_id:  athleteId,
  });
  if (error) throw new Error(error.message);
  return data as PushResult;
}

export async function getTemplateAssignments(templateId: string): Promise<TemplateAssignment[]> {
  const { data, error } = await supabase
    .from("routine_template_assignments")
    .select("*")
    .eq("template_id", templateId)
    .is("unassigned_at", null)
    .order("assigned_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Join athlete names
  const athleteIds = data.map((r: any) => r.athlete_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", athleteIds);

  const nameMap: Record<string, string> = {};
  for (const p of profiles || []) nameMap[(p as any).id] = (p as any).display_name || "Athlete";

  return data.map((r: any) => ({
    ...r,
    athlete_name: nameMap[r.athlete_id] || "Athlete",
  })) as TemplateAssignment[];
}

/** Returns the active template assignment for a given athlete (if any). */
export async function getAthleteAssignment(athleteId: string): Promise<TemplateAssignment | null> {
  const { data, error } = await supabase
    .from("routine_template_assignments")
    .select("*")
    .eq("athlete_id", athleteId)
    .is("unassigned_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as TemplateAssignment | null);
}

/**
 * Returns a map of athlete_id → { template_id, template_name } for every athlete
 * in the input list that has an active assignment. Used to lock athletes already
 * assigned to a different template so the "1 athlete = 1 template" rule is enforced
 * in the UI (the DB unique index is per-template, not per-athlete).
 */
export async function getActiveAssignmentsForAthletes(
  athleteIds: string[]
): Promise<Record<string, { template_id: string; template_name: string }>> {
  if (athleteIds.length === 0) return {};

  const { data, error } = await supabase
    .from("routine_template_assignments")
    .select("athlete_id, template_id, routine_templates(name)")
    .in("athlete_id", athleteIds)
    .is("unassigned_at", null);

  if (error) throw new Error(error.message);

  const map: Record<string, { template_id: string; template_name: string }> = {};
  for (const row of data || []) {
    const r = row as any;
    map[r.athlete_id] = {
      template_id: r.template_id,
      template_name: r.routine_templates?.name || "another template",
    };
  }
  return map;
}
