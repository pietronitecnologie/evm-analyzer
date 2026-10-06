// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Pietroni Tecnologie

//! Parser dell'XML MSPDI esportato da MS Project ("Salva come → XML").
//! Legge task, risorse e assegnazioni; i calendari non sono importati e
//! restano quelli standard del progetto.

use std::collections::HashMap;

use quick_xml::escape::unescape;
use quick_xml::events::Event;
use quick_xml::Reader;

use super::{ore_in_giorni, ImportedPlan, PlanAssignment, PlanLink, PlanResource, PlanTask};
use crate::tempo;

#[derive(Clone, Copy, PartialEq)]
enum Tipo {
    Task,
    Risorsa,
    Assegnazione,
}

/// Elemento in costruzione (un `<Task>`, `<Resource>` o `<Assignment>`).
struct Record {
    tipo: Tipo,
    /// Lunghezza dello stack quando il record è aperto: i suoi figli diretti
    /// si trovano a `profondita + 1`.
    profondita: usize,
    campi: HashMap<String, String>,
    collegamenti: Vec<HashMap<String, String>>,
}

pub fn leggi(xml: &str) -> Result<ImportedPlan, String> {
    let mut plan = ImportedPlan::default();
    let mut stack: Vec<String> = Vec::new();
    let mut corrente: Option<Record> = None;
    let mut reader = Reader::from_str(xml);

    loop {
        let evento = reader
            .read_event()
            .map_err(|e| format!("XML non valido: {e}"))?;
        match evento {
            Event::Start(e) => {
                let nome = e.local_name().as_ref().to_string();
                apri(&mut stack, &mut corrente, nome);
            }
            Event::Empty(e) => {
                let nome = e.local_name().as_ref().to_string();
                apri(&mut stack, &mut corrente, nome);
                chiudi(&mut stack, &mut corrente, &mut plan)?;
            }
            Event::Text(t) => {
                let testo = unescape(&t).map_err(|e| format!("testo XML non valido: {e}"))?;
                aggiungi_testo(&stack, &mut corrente, &testo);
            }
            // Le entità (`&amp;`, `&lt;`, …) arrivano come eventi separati: vanno
            // ricomposte nel testo dell'elemento, altrimenti il valore si spezza.
            Event::GeneralRef(r) => {
                let entita = format!("&{};", &*r);
                let testo = unescape(&entita).map_err(|e| format!("entità XML non valida: {e}"))?;
                aggiungi_testo(&stack, &mut corrente, &testo);
            }
            Event::End(_) => chiudi(&mut stack, &mut corrente, &mut plan)?,
            Event::Eof => break,
            _ => {}
        }
    }

    if plan.tasks.is_empty() {
        return Err("nessun task trovato nel file XML: è un export di MS Project?".into());
    }
    Ok(plan)
}

/// Aggiunge testo (non ancora ripulito) al campo dell'elemento corrente: un
/// campo di un record o un campo di un `PredecessorLink`.
fn aggiungi_testo(stack: &[String], corrente: &mut Option<Record>, testo: &str) {
    let (Some(c), Some(nome)) = (corrente.as_mut(), stack.last()) else { return };
    if stack.len() == c.profondita + 1 {
        c.campi.entry(nome.clone()).or_default().push_str(testo);
    } else if stack.len() == c.profondita + 2 && stack[stack.len() - 2] == "PredecessorLink" {
        if let Some(link) = c.collegamenti.last_mut() {
            link.entry(nome.clone()).or_default().push_str(testo);
        }
    }
}

fn apri(stack: &mut Vec<String>, corrente: &mut Option<Record>, nome: String) {
    stack.push(nome.clone());
    if corrente.is_some() {
        if stack.len() == corrente.as_ref().map_or(0, |c| c.profondita) + 1
            && nome == "PredecessorLink"
        {
            if let Some(c) = corrente.as_mut() {
                c.collegamenti.push(HashMap::new());
            }
        }
        return;
    }
    let tipo = match (nome.as_str(), stack.len().checked_sub(2).map(|i| stack[i].as_str())) {
        ("Task", Some("Tasks")) => Tipo::Task,
        ("Resource", Some("Resources")) => Tipo::Risorsa,
        ("Assignment", Some("Assignments")) => Tipo::Assegnazione,
        _ => return,
    };
    *corrente = Some(Record {
        tipo,
        profondita: stack.len(),
        campi: HashMap::new(),
        collegamenti: Vec::new(),
    });
}

fn chiudi(
    stack: &mut Vec<String>,
    corrente: &mut Option<Record>,
    plan: &mut ImportedPlan,
) -> Result<(), String> {
    stack.pop();
    let finito = corrente
        .as_ref()
        .is_some_and(|c| stack.len() + 1 == c.profondita);
    if finito {
        if let Some(record) = corrente.take() {
            match record.tipo {
                Tipo::Task => {
                    if let Some(task) = task_da_record(&record, plan) {
                        plan.tasks.push(task);
                    }
                }
                Tipo::Risorsa => {
                    if let Some(r) = risorsa_da_record(&record) {
                        plan.resources.push(r);
                    }
                }
                Tipo::Assegnazione => {
                    if let Some(a) = assegnazione_da_record(&record) {
                        plan.assignments.push(a);
                    }
                }
            }
        }
    }
    Ok(())
}

fn valore<'a>(c: &'a HashMap<String, String>, chiave: &str) -> Option<&'a str> {
    c.get(chiave).map(|v| v.trim()).filter(|v| !v.is_empty())
}

fn numero(c: &HashMap<String, String>, chiave: &str) -> Option<f64> {
    valore(c, chiave).and_then(|v| v.parse::<f64>().ok())
}

fn vero(c: &HashMap<String, String>, chiave: &str) -> bool {
    valore(c, chiave) == Some("1")
}

fn data(c: &HashMap<String, String>, chiave: &str) -> Option<String> {
    valore(c, chiave).and_then(tempo::normalizza_data)
}

fn ore(c: &HashMap<String, String>, chiave: &str) -> Option<f64> {
    valore(c, chiave).and_then(tempo::durata_iso_in_ore)
}

fn task_da_record(record: &Record, plan: &mut ImportedPlan) -> Option<PlanTask> {
    let c = &record.campi;
    let uid = valore(c, "UID")?.to_string();
    // UID 0 è il task di riepilogo del progetto, non un'attività.
    if uid == "0" {
        return None;
    }
    let predecessori = record
        .collegamenti
        .iter()
        .filter_map(|l| {
            let pred = valore(l, "PredecessorUID")?.to_string();
            let kind = match valore(l, "Type") {
                Some("0") => "FF",
                Some("2") => "SF",
                Some("3") => "SS",
                _ => "FS",
            };
            // LinkLag è in decimi di minuto.
            let lag_minutes = numero(l, "LinkLag").map_or(0, |v| (v / 10.0).round() as i64);
            Some(PlanLink {
                pred_uid: pred,
                kind: kind.to_string(),
                lag_minutes,
            })
        })
        .collect();

    // TotalSlack è in decimi di minuto: 10 * 60 decimi per ora.
    let float_days = numero(c, "TotalSlack").map(|v| v / 10.0 / 60.0 / super::ORE_PER_GIORNO);
    if valore(c, "Name").is_none() {
        plan.warnings.push(format!("task UID {uid} senza nome: importato comunque"));
    }

    Some(PlanTask {
        uid,
        name: valore(c, "Name").unwrap_or("").to_string(),
        wbs: valore(c, "WBS").map(str::to_string),
        is_summary: vero(c, "Summary"),
        is_milestone: vero(c, "Milestone"),
        is_critical: vero(c, "Critical"),
        start: data(c, "Start"),
        finish: data(c, "Finish"),
        duration_days: ore(c, "Duration").map(ore_in_giorni),
        float_days,
        pct_complete: numero(c, "PercentComplete"),
        actual_start: data(c, "ActualStart"),
        actual_finish: data(c, "ActualFinish"),
        work_hours: ore(c, "Work"),
        cost: numero(c, "Cost"),
        predecessors: predecessori,
    })
}

fn risorsa_da_record(record: &Record) -> Option<PlanResource> {
    let c = &record.campi;
    let uid = valore(c, "UID")?.to_string();
    if uid == "0" {
        return None;
    }
    let kind = match valore(c, "Type") {
        Some("0") => "materiale",
        Some("2") => "costo",
        _ => "lavoro",
    };
    Some(PlanResource {
        uid,
        name: valore(c, "Name").unwrap_or("").to_string(),
        kind: Some(kind.to_string()),
        std_rate: numero(c, "StandardRate"),
        overtime_rate: numero(c, "OvertimeRate"),
        cost_per_use: numero(c, "CostPerUse"),
    })
}

fn assegnazione_da_record(record: &Record) -> Option<PlanAssignment> {
    let c = &record.campi;
    let task_uid = valore(c, "TaskUID")?.to_string();
    let resource_uid = valore(c, "ResourceUID")?.to_string();
    // 65535 è il segnaposto di MS Project per "nessuna risorsa".
    if resource_uid == "65535" || task_uid == "0" {
        return None;
    }
    Some(PlanAssignment {
        task_uid,
        resource_uid,
        units: numero(c, "Units").unwrap_or(1.0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Tasks>
    <Task><UID>0</UID><Name>Progetto</Name></Task>
    <Task>
      <UID>1</UID><Name>Fase A &amp; B</Name><WBS>1</WBS><Summary>1</Summary>
      <Start>2026-01-05T08:00:00</Start><Finish>2026-01-16T17:00:00</Finish>
      <Duration>PT80H0M0S</Duration><PercentComplete>50</PercentComplete>
    </Task>
    <Task>
      <UID>2</UID><Name>Scavo</Name><WBS>1.1</WBS><Critical>1</Critical>
      <Start>2026-01-05T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish>
      <Duration>PT40H0M0S</Duration><TotalSlack>0</TotalSlack><Cost>1200</Cost>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag></PredecessorLink>
    </Task>
  </Tasks>
  <Resources>
    <Resource><UID>1</UID><Name>Mario</Name><Type>1</Type><StandardRate>30</StandardRate></Resource>
  </Resources>
  <Assignments>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID><Units>0.5</Units></Assignment>
  </Assignments>
</Project>"#;

    #[test]
    fn legge_task_risorse_e_assegnazioni() {
        let plan = leggi(XML).unwrap();
        assert_eq!(plan.tasks.len(), 2, "il task UID 0 non è un'attività");
        let scavo = &plan.tasks[1];
        assert_eq!(scavo.name, "Scavo");
        assert_eq!(scavo.wbs.as_deref(), Some("1.1"));
        assert_eq!(scavo.duration_days, Some(5.0));
        assert_eq!(scavo.start.as_deref(), Some("2026-01-05"));
        assert!(scavo.is_critical);
        assert_eq!(scavo.cost, Some(1200.0));
        assert_eq!(scavo.predecessors.len(), 1);
        assert_eq!(scavo.predecessors[0].pred_uid, "1");
        assert_eq!(scavo.predecessors[0].kind, "FS");
        assert_eq!(scavo.predecessors[0].lag_minutes, 480);
        assert_eq!(plan.tasks[0].name, "Fase A & B");
        assert_eq!(plan.tasks[0].pct_complete, Some(50.0));
        assert_eq!(plan.resources.len(), 1);
        assert_eq!(plan.resources[0].std_rate, Some(30.0));
        assert_eq!(plan.assignments.len(), 1);
        assert_eq!(plan.assignments[0].units, 0.5);
    }

    #[test]
    fn rifiuta_un_xml_senza_task() {
        assert!(leggi("<Project><Tasks/></Project>").is_err());
    }
}
