-- Expand Cadence Fitness body_metrics for RENPHO body-composition reports.
-- These fields keep diet baselines and scale reports queryable instead of
-- burying them in free-text notes.

alter table fitness.body_metrics
  add column if not exists measurement_at timestamptz,
  add column if not exists body_score int,
  add column if not exists body_fat_mass_kg numeric(5,2),
  add column if not exists fat_free_mass_kg numeric(5,2),
  add column if not exists skeletal_muscle_mass_kg numeric(5,2),
  add column if not exists bmi numeric(4,1),
  add column if not exists bmr_kcal int,
  add column if not exists visceral_fat numeric(4,1),
  add column if not exists subcutaneous_fat_pct numeric(4,1),
  add column if not exists bone_mass_kg numeric(5,2),
  add column if not exists protein_mass_kg numeric(5,2),
  add column if not exists body_water_mass_kg numeric(5,2),
  add column if not exists smi_kg_m2 numeric(4,1),
  add column if not exists whr numeric(4,2),
  add column if not exists metabolic_age int,
  add column if not exists height_cm numeric(5,1),
  add column if not exists report_age int,
  add column if not exists report_sex text,
  add column if not exists optimal_weight_kg numeric(5,2),
  add column if not exists target_weight_delta_kg numeric(5,2),
  add column if not exists target_fat_mass_delta_kg numeric(5,2),
  add column if not exists target_muscle_mass_delta_kg numeric(5,2);

comment on column fitness.body_metrics.measurement_at is 'Exact scale measurement timestamp when available from RENPHO or Health export.';
comment on column fitness.body_metrics.body_score is 'RENPHO body score out of 100.';
comment on column fitness.body_metrics.body_fat_mass_kg is 'Total fat mass from body-composition scale.';
comment on column fitness.body_metrics.fat_free_mass_kg is 'Fat-free / lean mass from body-composition scale.';
comment on column fitness.body_metrics.skeletal_muscle_mass_kg is 'Skeletal muscle mass from body-composition scale.';
comment on column fitness.body_metrics.smi_kg_m2 is 'Skeletal muscle index in kg/m².';
comment on column fitness.body_metrics.whr is 'Waist-to-hip ratio from body-composition report.';
