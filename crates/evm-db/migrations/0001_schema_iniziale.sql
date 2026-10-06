-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Pietroni Tecnologie
--
-- Schema iniziale (sez. 4 del prompt di sviluppo). Un file .evmproj per
-- progetto. Date e date/ora in ISO-8601 (TEXT); i serial Excel si
-- convertono solo ai bordi di import/export (sez. 4, sez. 5).
--
-- Note di interpretazione (documentate anche in DECISIONS.md):
--  * gli id interni sono INTEGER PRIMARY KEY; dove la sez. 4 richiede un
--    identificatore globale univoco (package.id) si usa TEXT (UUID);
--  * "roles" di user_profile è un insieme non vuoto di ruoli cumulabili:
--    normalizzato in una tabella user_role separata;
--  * le tabelle "..." di sez. 4 (risk, reserve_usage, agile_sprint,
--    kanban_flow) sono dettagliate secondo le schermate di sez. 8.5
--    (#12 Buffer e riserve, #13 Agile/Flow).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Progetto, calendari, parametri
-- ---------------------------------------------------------------------

CREATE TABLE project (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('xml_mspdi', 'excel', 'csv', 'manuale')),
  source_file     TEXT,
  imported_at     TEXT,
  schema_version  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE project_params (
  project_id              INTEGER PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  overhead_pct            REAL NOT NULL DEFAULT 0,
  contingency_pct         REAL NOT NULL DEFAULT 0,
  mgmt_reserve_pct        REAL NOT NULL DEFAULT 0,
  green_threshold         REAL NOT NULL DEFAULT 0.95,
  yellow_threshold        REAL NOT NULL DEFAULT 0.85,
  start_date              TEXT,
  planned_end_date        TEXT,
  time_buffer_days        REAL NOT NULL DEFAULT 0,
  sprint_days             INTEGER NOT NULL DEFAULT 14,
  team_cost_per_sprint    REAL,
  velocity_window         INTEGER NOT NULL DEFAULT 3,
  -- 6-bis.1: con/senza contingency nella base di misura dell'EV.
  ev_base_mode            TEXT NOT NULL DEFAULT 'bac_senza_contingency'
                            CHECK (ev_base_mode IN ('bac_con_contingency', 'bac_senza_contingency')),
  planned_sp_per_sprint   REAL,
  -- 6-bis.2: costo/SP non circolare, fissato in baseline.
  baseline_cost_per_sp    REAL
);

CREATE TABLE calendar (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  working_days_mask INTEGER NOT NULL DEFAULT 31 -- bit 0..6 = lun..dom, default lun-ven
);

CREATE TABLE calendar_exception (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id   INTEGER NOT NULL REFERENCES calendar(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  is_working    INTEGER NOT NULL CHECK (is_working IN (0, 1)),
  note          TEXT
);

-- ---------------------------------------------------------------------
-- WBS, control account, filoni, risorse
-- ---------------------------------------------------------------------

CREATE TABLE wbs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  parent_id   INTEGER REFERENCES wbs(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL
);

CREATE TABLE control_account (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  wbs_id  INTEGER NOT NULL REFERENCES wbs(id) ON DELETE CASCADE,
  name    TEXT NOT NULL
);

-- Filone (sez. 6-bis.3, §3.9.2): livello di aggregazione di programma.
CREATE TABLE workstream (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  kind                TEXT NOT NULL CHECK (kind IN ('costruzione', 'automazione', 'software', 'altro')),
  measure_method      TEXT NOT NULL CHECK (measure_method IN ('unita_fisiche', 'milestone_pesate', 'story_point', 'flusso')),
  planned_unit_value  REAL
);

CREATE TABLE workstream_gate (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  from_workstream_id  INTEGER NOT NULL REFERENCES workstream(id) ON DELETE CASCADE,
  to_workstream_id    INTEGER NOT NULL REFERENCES workstream(id) ON DELETE CASCADE,
  description         TEXT,
  buffer_days         REAL NOT NULL DEFAULT 0
);

CREATE TABLE resource (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  type              TEXT,
  std_rate          REAL,
  overtime_rate     REAL,
  cost_per_use      REAL,
  -- Costo orario reale del Cap. 2 (§2.3): se presente prevale su std_rate (6-bis.7).
  real_hourly_cost  REAL,
  rate_source       TEXT NOT NULL DEFAULT 'importata' CHECK (rate_source IN ('importata', 'costo_reale'))
);

-- ---------------------------------------------------------------------
-- Task, dipendenze, assegnazioni
-- ---------------------------------------------------------------------

CREATE TABLE task (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  wbs_id              INTEGER REFERENCES wbs(id) ON DELETE SET NULL,
  workstream_id       INTEGER REFERENCES workstream(id) ON DELETE SET NULL,
  control_account_id  INTEGER REFERENCES control_account(id) ON DELETE SET NULL,
  -- Chiave di aggancio del profilo di importazione (Unique ID / Activity ID / ...).
  uid_source          TEXT NOT NULL,
  name                TEXT NOT NULL,
  phase               TEXT,
  is_summary          INTEGER NOT NULL DEFAULT 0 CHECK (is_summary IN (0, 1)),
  is_milestone        INTEGER NOT NULL DEFAULT 0 CHECK (is_milestone IN (0, 1)),
  ev_method           TEXT CHECK (ev_method IN (
                          '0_100', '50_50', '20_80', 'unita_fisiche',
                          'milestone_pesate', 'loe', 'pct_soggettiva'
                        )),
  weight_pct          REAL,
  start_planned       TEXT,
  finish_planned      TEXT,
  duration_planned_days REAL,
  float_days          REAL,
  is_critical         INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1)),
  UNIQUE (project_id, uid_source)
);

CREATE INDEX idx_task_project ON task(project_id);
CREATE INDEX idx_task_wbs ON task(wbs_id);
CREATE INDEX idx_task_workstream ON task(workstream_id);

CREATE TABLE dependency (
  pred_id     INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  succ_id     INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('FS', 'SS', 'FF', 'SF')),
  lag_minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pred_id, succ_id)
);

CREATE TABLE assignment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  resource_id   INTEGER NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
  units         REAL NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------
-- Baseline, scope di baseline, change request (immutabilità: sez. 6-bis.4)
-- ---------------------------------------------------------------------

CREATE TABLE baseline (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('stima', 'startup', 'altra')),
  created_at      TEXT NOT NULL,
  locked          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  bac_direct      REAL,
  bac_indirect    REAL,
  bac_contingency REAL,
  bac_total       REAL
);

CREATE TABLE baseline_scope (
  baseline_id INTEGER NOT NULL REFERENCES baseline(id) ON DELETE CASCADE,
  wbs_id      INTEGER NOT NULL REFERENCES wbs(id) ON DELETE CASCADE,
  included    INTEGER NOT NULL DEFAULT 1 CHECK (included IN (0, 1)),
  note        TEXT,
  PRIMARY KEY (baseline_id, wbs_id)
);

-- Unico modo per derivare una nuova baseline da una bloccata (6-bis.4).
CREATE TABLE change_request (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id              INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  baseline_from_id        INTEGER REFERENCES baseline(id),
  baseline_to_id          INTEGER REFERENCES baseline(id),
  requested_at            TEXT NOT NULL,
  approved_at             TEXT,
  approved_by             TEXT,
  reason                  TEXT NOT NULL,
  delta_cost              REAL,
  delta_duration_days     REAL,
  delta_scope_note        TEXT
);

CREATE TABLE baseline_task (
  baseline_id INTEGER NOT NULL REFERENCES baseline(id) ON DELETE CASCADE,
  task_id     INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  start       TEXT,
  finish      TEXT,
  duration    REAL,
  work        REAL,
  cost        REAL,
  PRIMARY KEY (baseline_id, task_id)
);

-- Base del PV (sez. 4: "<- base del PV").
CREATE TABLE baseline_timephased (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  baseline_id   INTEGER NOT NULL REFERENCES baseline(id) ON DELETE CASCADE,
  task_id       INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  resource_id   INTEGER REFERENCES resource(id) ON DELETE SET NULL,
  period_start  TEXT NOT NULL,
  work          REAL,
  cost          REAL
);

CREATE INDEX idx_baseline_timephased_task ON baseline_timephased(baseline_id, task_id);

-- Trigger di immutabilità: nessuna baseline bloccata è modificabile da UI
-- o da SQL diretto senza una change_request (criteri di accettazione, sez. 10).
CREATE TRIGGER trg_baseline_no_update_if_locked
BEFORE UPDATE ON baseline
WHEN OLD.locked = 1 AND NEW.locked = 1
BEGIN
  SELECT RAISE(ABORT, 'baseline bloccata: creare una change_request per modificarla');
END;

CREATE TRIGGER trg_baseline_no_delete_if_locked
BEFORE DELETE ON baseline
WHEN OLD.locked = 1
BEGIN
  SELECT RAISE(ABORT, 'baseline bloccata: non può essere eliminata');
END;

CREATE TRIGGER trg_baseline_task_no_write_if_locked
BEFORE UPDATE ON baseline_task
WHEN (SELECT locked FROM baseline WHERE id = OLD.baseline_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'baseline bloccata: baseline_task non modificabile');
END;

CREATE TRIGGER trg_baseline_task_no_delete_if_locked
BEFORE DELETE ON baseline_task
WHEN (SELECT locked FROM baseline WHERE id = OLD.baseline_id) = 1
BEGIN
  SELECT RAISE(ABORT, 'baseline bloccata: baseline_task non eliminabile');
END;

-- ---------------------------------------------------------------------
-- Status snapshot e dati di avanzamento letti dal piano re-importato
-- ---------------------------------------------------------------------

CREATE TABLE status_snapshot (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  status_date TEXT NOT NULL,
  label       TEXT,
  source      TEXT NOT NULL CHECK (source IN ('import_piano', 'feeder', 'manuale'))
);

CREATE TABLE snapshot_task (
  snapshot_id     INTEGER NOT NULL REFERENCES status_snapshot(id) ON DELETE CASCADE,
  task_id         INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  actual_start    TEXT,
  actual_finish   TEXT,
  pct_complete    REAL,
  physical_pct    REAL,
  remaining_work  REAL,
  ac_cost         REAL,
  ev_override     REAL,
  PRIMARY KEY (snapshot_id, task_id)
);

CREATE TABLE snapshot_timephased (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id   INTEGER NOT NULL REFERENCES status_snapshot(id) ON DELETE CASCADE,
  task_id       INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  resource_id   INTEGER REFERENCES resource(id) ON DELETE SET NULL,
  period_start  TEXT NOT NULL,
  actual_work   REAL,
  actual_cost   REAL
);

CREATE INDEX idx_snapshot_timephased_task ON snapshot_timephased(snapshot_id, task_id);

-- ---------------------------------------------------------------------
-- Perimetri e utenti (6-quater)
-- ---------------------------------------------------------------------

CREATE TABLE user_profile (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uid      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  public_key    TEXT,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- Ruoli cumulabili (sez. 6-quater.6): insieme non vuoto per utente.
CREATE TABLE user_role (
  user_profile_id INTEGER NOT NULL REFERENCES user_profile(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN (
                      'project_engineer', 'supervisore', 'coordinatore_piano', 'amministratore'
                    )),
  PRIMARY KEY (user_profile_id, role)
);

CREATE TABLE scope (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  rule_kind       TEXT NOT NULL CHECK (rule_kind IN ('wbs', 'filone', 'control_account', 'task_list', 'risorsa', 'mista')),
  rule_json       TEXT NOT NULL,
  owner_user_id   INTEGER REFERENCES user_profile(id),
  approver_user_id INTEGER REFERENCES user_profile(id),
  plan_hash       TEXT,
  resolved_at     TEXT
);

CREATE TABLE scope_task (
  scope_id    INTEGER NOT NULL REFERENCES scope(id) ON DELETE CASCADE,
  task_id     INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  uid_source  TEXT NOT NULL,
  added_by    INTEGER REFERENCES user_profile(id),
  added_at    TEXT NOT NULL,
  PRIMARY KEY (scope_id, task_id)
);

CREATE TABLE progress_package (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Identificatore globale univoco del pacchetto (UUID): importazione
  -- idempotente per package_uid (sez. 6-quater.2).
  package_uid       TEXT NOT NULL UNIQUE,
  project_id        INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('lavoro', 'avanzamento', 'aggiornamento_piano')),
  scope_id          INTEGER REFERENCES scope(id),
  from_user_id      INTEGER REFERENCES user_profile(id),
  created_at        TEXT NOT NULL,
  status_date       TEXT,
  plan_hash         TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1,
  content_hash      TEXT NOT NULL,
  signature         TEXT,
  imported_at       TEXT,
  import_result_json TEXT
);

CREATE TABLE package_conflict (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  snapshot_id     INTEGER REFERENCES status_snapshot(id),
  task_id         INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  package_a_id    INTEGER NOT NULL REFERENCES progress_package(id),
  package_b_id    INTEGER NOT NULL REFERENCES progress_package(id),
  field           TEXT NOT NULL,
  value_a         TEXT,
  value_b         TEXT,
  resolution      TEXT CHECK (resolution IN ('valore_a', 'valore_b', 'manuale')),
  resolved_by     INTEGER REFERENCES user_profile(id),
  resolved_at     TEXT
);

-- ---------------------------------------------------------------------
-- Avanzamento, feed verso MS Project, audit, sincronizzazione (6-ter)
-- ---------------------------------------------------------------------

CREATE TABLE progress_entry (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id             INTEGER NOT NULL REFERENCES status_snapshot(id) ON DELETE CASCADE,
  task_id                 INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  scope_id                INTEGER REFERENCES scope(id),
  package_id              INTEGER REFERENCES progress_package(id),
  entered_by              INTEGER REFERENCES user_profile(id),
  entered_at              TEXT NOT NULL,
  measure_method          TEXT,
  units_done              REAL,
  units_total             REAL,
  milestones_json         TEXT,
  subjective_pct          REAL,
  independent_signal_json TEXT,
  physical_pct            REAL,
  pct_complete            REAL,
  actual_start            TEXT,
  actual_finish           TEXT,
  actual_work_h           REAL,
  actual_cost             REAL,
  remaining_work_h        REAL,
  note                    TEXT,
  state                   TEXT NOT NULL DEFAULT 'bozza'
                            CHECK (state IN ('bozza', 'inviato', 'approvato', 'applicato', 'respinto'))
);

CREATE INDEX idx_progress_entry_task ON progress_entry(task_id);
CREATE INDEX idx_progress_entry_snapshot ON progress_entry(snapshot_id);

CREATE TABLE feed_batch (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  snapshot_id        INTEGER NOT NULL REFERENCES status_snapshot(id),
  scope_id          INTEGER REFERENCES scope(id),
  status_date       TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  created_by        INTEGER REFERENCES user_profile(id),
  channel           TEXT NOT NULL CHECK (channel IN ('excel_msproject', 'excel_p6', 'csv_generico')),
  source_file_hash  TEXT,
  schema_version    INTEGER NOT NULL DEFAULT 1,
  applied_at        TEXT,
  verified_at       TEXT,
  verify_result_json TEXT
);

CREATE TABLE feed_batch_item (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id    INTEGER NOT NULL REFERENCES feed_batch(id) ON DELETE CASCADE,
  task_id     INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  uid_source  TEXT NOT NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT
);

CREATE INDEX idx_feed_batch_item_batch ON feed_batch_item(batch_id);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL,
  user        TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT
);

CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id);

CREATE TABLE source_sync (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  source_file   TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  file_mtime    TEXT,
  imported_at   TEXT NOT NULL,
  task_count    INTEGER
);

-- ---------------------------------------------------------------------
-- Monte Carlo, buffer/riserve, Agile/Flow (sez. 8.5 #10, #12, #13)
-- ---------------------------------------------------------------------

CREATE TABLE monte_carlo_run (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('velocity', 'throughput', 'durata_costo')),
  n_iter        INTEGER NOT NULL,
  seed          INTEGER NOT NULL,
  params_json   TEXT NOT NULL,
  result_json   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE risk (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id              INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  description             TEXT NOT NULL,
  probability_pct         REAL,
  impact_estimated        REAL,
  contingency_allocated   REAL,
  usage_date              TEXT,
  usage_amount            REAL,
  status                  TEXT NOT NULL DEFAULT 'aperto' CHECK (status IN ('aperto', 'mitigato', 'chiuso'))
);

CREATE TABLE reserve_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('contingency', 'management_reserve', 'buffer_tempo')),
  status_snapshot_id INTEGER REFERENCES status_snapshot(id),
  amount            REAL NOT NULL,
  date              TEXT NOT NULL,
  note              TEXT
);

CREATE TABLE agile_sprint (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  workstream_id   INTEGER REFERENCES workstream(id) ON DELETE CASCADE,
  sprint_number   INTEGER NOT NULL,
  start_date      TEXT,
  end_date        TEXT,
  sp_planned      REAL,
  sp_completed    REAL,
  team_cost       REAL,
  UNIQUE (workstream_id, sprint_number)
);

CREATE TABLE kanban_flow (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  workstream_id   INTEGER REFERENCES workstream(id) ON DELETE CASCADE,
  period_start    TEXT NOT NULL,
  period_end      TEXT NOT NULL,
  throughput      REAL,
  cycle_time_days REAL,
  wip_observed    REAL
);

CREATE TABLE import_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('piano_xml', 'piano_excel', 'piano_csv', 'workbook_excel', 'pacchetto')),
  file          TEXT,
  timestamp     TEXT NOT NULL,
  warnings_json TEXT
);
