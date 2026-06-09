"""
Cadence — Executive Operating System
A Streamlit app for managing tasks, projects, decisions and daily priorities.
All data is stored locally in a JSON file (cadence_data.json).
"""

import json
import os
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import streamlit as st

# ── Config ────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Cadence",
    page_icon="☀",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Shared store — same file agents read/write (override with CADENCE_DATA).
# This is what makes the cockpit a shared surface for humans and agents.
DATA_FILE = Path(os.environ.get("CADENCE_DATA", Path(__file__).parent / "cadence_data.json"))

# ── Palette / CSS ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
  /* Typography */
  [data-testid="stSidebar"] { background: #1A1F2E !important; }
  [data-testid="stSidebar"] * { color: rgba(255,255,255,0.82) !important; }
  [data-testid="stSidebar"] .stRadio label { font-size: 15px !important; padding: 6px 0 !important; }
  [data-testid="stSidebar"] h1 { color: #FFFFFF !important; font-size: 24px !important; }
  [data-testid="stSidebar"] .stRadio [role=radio][aria-checked=true] + div { color: #FFFFFF !important; font-weight: 600 !important; }

  /* Cards */
  .cadence-card {
    background: #FFFFFF;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .cadence-card:hover { border-color: #4A8FD4; }
  .cadence-focus-card {
    background: linear-gradient(135deg, #EBF3FD, #F0F6FF);
    border: 1px solid #C8DEF5;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 16px;
  }
  /* Tags */
  .tag { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .tag-task { background: #EDF4FD; color: #1B5E9E; }
  .tag-decision { background: #F3EEFA; color: #6B3FA0; }
  .tag-followup { background: #FFF8EE; color: #E07D00; }
  .tag-waiting { background: #ECFAFA; color: #0E7490; }
  .tag-risk { background: #FEF2F1; color: #D93025; }
  .tag-action { background: #EDFAF1; color: #1A7F37; }
  .pri-high { background: #FEF2F1; color: #D93025; }
  .pri-medium { background: #FFF8EE; color: #E07D00; }
  .pri-low { background: #F4F4F4; color: #6B6B6B; }
  .due-overdue { color: #D93025; font-weight: 600; }
  .due-today { color: #E07D00; font-weight: 600; }
  .due-soon { color: #1A7F37; }

  /* Section headings */
  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #6B6B6B;
    margin: 16px 0 8px;
  }
  .count-badge {
    display: inline-block;
    background: #1B5E9E;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 8px;
    margin-left: 6px;
    vertical-align: middle;
  }
  .count-badge.red { background: #D93025; }
  .count-badge.purple { background: #6B3FA0; }
  .count-badge.orange { background: #E07D00; }
  .count-badge.green { background: #1A7F37; }
</style>
""", unsafe_allow_html=True)

# ── Data layer ────────────────────────────────────────────────────────────────

def load_data():
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text())
        except Exception:
            pass
    return {"work_items": [], "projects": [], "people": [], "decisions": []}

def save_data():
    DATA_FILE.write_text(json.dumps(st.session_state.db, indent=2))

def init_db():
    if "db" not in st.session_state:
        st.session_state.db = load_data()

init_db()
db = st.session_state.db

def new_id():
    return str(uuid.uuid4())[:8]

def today_str():
    return date.today().isoformat()

def fmt_date(d):
    if not d:
        return ""
    try:
        t = date.fromisoformat(d)
    except Exception:
        return d
    delta = (t - date.today()).days
    if delta < 0:
        return f"Overdue {abs(delta)}d"
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    if delta < 7:
        return f"In {delta}d"
    return t.strftime("%-d %b")

def is_overdue(d):
    return bool(d and d < today_str())

def is_due_today(d):
    return d == today_str()

def priority_score(w):
    s = 0
    if is_overdue(w.get("due_date")):
        s += 100
    elif is_due_today(w.get("due_date")):
        s += 50
    p = w.get("priority", "medium")
    s += {"high": 60, "medium": 40, "low": 20}.get(p, 20)
    if w.get("type") in ("decision", "risk"):
        s += 15
    return s

# ── Tag helpers ───────────────────────────────────────────────────────────────

TYPE_LABELS = {
    "task": ("Task", "tag-task"),
    "decision": ("Decision", "tag-decision"),
    "followUp": ("Follow Up", "tag-followup"),
    "waitingFor": ("Waiting For", "tag-waiting"),
    "risk": ("Risk", "tag-risk"),
    "action": ("Meeting Action", "tag-action"),
}
TYPE_OPTIONS = {
    "task": "Task",
    "decision": "Decision",
    "followUp": "Follow Up",
    "waitingFor": "Waiting For",
    "risk": "Risk",
    "action": "Meeting Action",
}

def type_tag(t):
    label, cls = TYPE_LABELS.get(t, ("Task", "tag-task"))
    return f'<span class="tag {cls}">{label}</span>'

def pri_tag(p):
    cls = {"high": "pri-high", "medium": "pri-medium", "low": "pri-low"}.get(p, "pri-low")
    return f'<span class="tag {cls}">{p.capitalize()}</span>'

def due_html(d):
    if not d:
        return ""
    label = fmt_date(d)
    if is_overdue(d):
        return f'<span class="due-overdue">⚠ {label}</span>'
    if is_due_today(d):
        return f'<span class="due-today">● {label}</span>'
    return f'<span class="due-soon">{label}</span>'

# ── Sidebar nav ───────────────────────────────────────────────────────────────

with st.sidebar:
    st.markdown("# ☀ Cadence")
    st.markdown("---")
    inbox_count = len([w for w in db["work_items"] if w.get("inboxed") and not w.get("done")])
    dec_count   = len([d for d in db["decisions"] if d.get("status") == "pending"])

    page = st.radio(
        "",
        options=["today", "capture", "inbox", "projects", "people", "decisions", "review", "search", "settings"],
        format_func=lambda x: {
            "today":     "☀  Today",
            "capture":   "⊡  Capture",
            "inbox":     f"↓  Inbox  ({inbox_count})" if inbox_count else "↓  Inbox",
            "projects":  "▤  Projects",
            "people":    "✦  People",
            "decisions": f"⚖  Decisions  ({dec_count})" if dec_count else "⚖  Decisions",
            "review":    "✓  Review",
            "search":    "⌕  Search",
            "settings":  "⚙  Settings",
        }[x],
        label_visibility="collapsed",
    )

# ═══════════════════════════════════════════════════════════════════════════════
# TODAY
# ═══════════════════════════════════════════════════════════════════════════════
if page == "today":
    col_h, col_btn = st.columns([4, 1])
    with col_h:
        st.title("Today")
        st.caption(date.today().strftime("%A, %-d %B %Y"))
    with col_btn:
        st.write("")
        if st.button("+ Quick Add", use_container_width=True, type="primary"):
            st.session_state.show_quick_add = True

    active = [w for w in db["work_items"] if not w.get("done")]
    scored = sorted(active, key=priority_score, reverse=True)

    # ── Focus block
    top3 = scored[:3]
    if top3:
        st.markdown(f"""
        <div class="cadence-focus-card">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#1B5E9E;margin-bottom:4px">🧠 Suggested Focus</div>
          <div style="font-size:15px;font-weight:600;color:#1A1A1A">{top3[0]['title']}</div>
        </div>""", unsafe_allow_html=True)

    # ── Top 3 priorities
    st.markdown(f'<div class="section-title">Top 3 Priorities <span class="count-badge">{len(top3)}</span></div>', unsafe_allow_html=True)
    if not top3:
        st.info("All clear! Add some items to get started.")
    else:
        cols = st.columns(min(len(top3), 3))
        for i, w in enumerate(top3):
            with cols[i]:
                proj = next((p for p in db["projects"] if p["id"] == w.get("project_id")), None)
                st.markdown(f"""
                <div class="cadence-card">
                  <div style="margin-bottom:6px">{type_tag(w.get('type','task'))} {pri_tag(w.get('priority','medium'))}</div>
                  <div style="font-size:14px;font-weight:600;color:#1A1A1A;line-height:1.3">{w['title']}</div>
                  {f'<div style="font-size:11px;color:#6B6B6B;margin-top:4px">▤ {proj["name"]}</div>' if proj else ''}
                  <div style="margin-top:6px">{due_html(w.get('due_date'))}</div>
                </div>""", unsafe_allow_html=True)

    # ── Overdue
    overdue = [w for w in active if is_overdue(w.get("due_date"))]
    st.markdown(f'<div class="section-title">Overdue <span class="count-badge red">{len(overdue)}</span></div>', unsafe_allow_html=True)
    if not overdue:
        st.caption("Nothing overdue — great!")
    for w in overdue:
        _c1, _c2, _c3 = st.columns([0.04, 0.82, 0.14])
        with _c1:
            done = st.checkbox("", key=f"done_{w['id']}_ov", value=w.get("done", False))
            if done != w.get("done", False):
                w["done"] = done
                save_data(); st.rerun()
        with _c2:
            st.markdown(f"{type_tag(w.get('type','task'))} {pri_tag(w.get('priority','medium'))} <b>{w['title']}</b> {due_html(w.get('due_date'))}", unsafe_allow_html=True)

    # ── Waiting on others
    waiting = [w for w in active if w.get("type") == "waitingFor"]
    st.markdown(f'<div class="section-title">Waiting on Others <span class="count-badge purple">{len(waiting)}</span></div>', unsafe_allow_html=True)
    if not waiting:
        st.caption("Nothing waiting on others.")
    for w in waiting:
        person = next((p for p in db["people"] if p["id"] == w.get("person_id")), None)
        st.markdown(f"""
        <div class="cadence-card">
          {type_tag('waitingFor')} {pri_tag(w.get('priority','medium'))}
          <b style="font-size:14px"> {w['title']}</b>
          {f' · <span style="color:#0E7490">@ {person["name"]}</span>' if person else ''}
          {due_html(w.get('due_date'))}
        </div>""", unsafe_allow_html=True)

    # ── Pending decisions
    pending_decs = [d for d in db["decisions"] if d.get("status") == "pending"]
    st.markdown(f'<div class="section-title">Decisions Needed <span class="count-badge purple">{len(pending_decs)}</span></div>', unsafe_allow_html=True)
    if not pending_decs:
        st.caption("No pending decisions.")
    for d in pending_decs:
        st.markdown(f"""
        <div class="cadence-card">
          <span class="tag tag-decision">Decision</span>
          <b style="font-size:14px"> {d['title']}</b>
          {due_html(d.get('due_date'))}
        </div>""", unsafe_allow_html=True)

    # ── Due today
    due_today_items = [w for w in active if is_due_today(w.get("due_date")) and w.get("type") != "waitingFor"]
    st.markdown(f'<div class="section-title">Due Today <span class="count-badge orange">{len(due_today_items)}</span></div>', unsafe_allow_html=True)
    if not due_today_items:
        st.caption("Nothing else due today.")
    for w in due_today_items:
        _c1, _c2 = st.columns([0.04, 0.96])
        with _c1:
            done = st.checkbox("", key=f"done_{w['id']}_dt", value=w.get("done", False))
            if done != w.get("done", False):
                w["done"] = done; save_data(); st.rerun()
        with _c2:
            st.markdown(f"{type_tag(w.get('type','task'))} <b>{w['title']}</b>", unsafe_allow_html=True)

    # ── Quick Add dialog
    if st.session_state.get("show_quick_add"):
        with st.form("quick_add_form", clear_on_submit=True):
            st.subheader("Quick Add")
            title = st.text_input("Title *", placeholder="What needs to happen?")
            c1, c2 = st.columns(2)
            with c1:
                item_type = st.selectbox("Type", list(TYPE_OPTIONS.keys()), format_func=lambda x: TYPE_OPTIONS[x])
            with c2:
                priority = st.selectbox("Priority", ["high", "medium", "low"], index=1, format_func=str.capitalize)
            due = st.date_input("Due date (optional)", value=None)
            submitted = st.form_submit_button("Add to Inbox", type="primary")
            cancel = st.form_submit_button("Cancel")
            if submitted and title.strip():
                db["work_items"].append({
                    "id": new_id(), "title": title.strip(), "type": item_type,
                    "priority": priority, "due_date": due.isoformat() if due else None,
                    "project_id": None, "person_id": None, "notes": "",
                    "done": False, "inboxed": True,
                    "created_at": datetime.now().isoformat(),
                })
                save_data()
                st.session_state.show_quick_add = False
                st.rerun()
            if cancel:
                st.session_state.show_quick_add = False
                st.rerun()

# ═══════════════════════════════════════════════════════════════════════════════
# CAPTURE
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "capture":
    st.title("Capture")
    st.caption("Paste text or upload a screenshot to extract work items using local heuristics.")

    tab1, tab2 = st.tabs(["Text / Notes", "Screenshot (paste text)"])

    def classify_text(text):
        import re
        results = []
        lines = [l.strip() for l in re.split(r'[\n.!?]+', text) if len(l.strip()) > 10]
        for line in lines[:25]:
            lower = line.lower()
            t = "task"
            if re.search(r'follow\s?up|chase|check\s?in|ping|reach\s?out', lower): t = "followUp"
            elif re.search(r'waiting\s?for|pending\s+(from|on)|hasn.t', lower): t = "waitingFor"
            elif re.search(r'decide|decision|approve|sign\s?off|choose', lower): t = "decision"
            elif re.search(r'risk|blocker|issue|concern|escalat', lower): t = "risk"
            elif re.search(r'action\s?item|agreed\s+to|will\s+(do|send)|committed', lower): t = "action"
            p = "medium"
            if re.search(r'urgent|asap|critical|immediately|overdue|today', lower): p = "high"
            elif re.search(r'low\s+priority|nice\s+to\s+have|eventually', lower): p = "low"
            results.append({"title": line[:120], "type": t, "priority": p})
        return results

    with tab1:
        text = st.text_area("Brain dump or meeting notes", height=200,
                            placeholder="Type or paste anything — emails, meeting notes, thoughts…")
        if st.button("🔍 Extract Work Items", type="primary") and text.strip():
            results = classify_text(text)
            st.session_state.cap_results = results
            if not results:
                st.warning("No items found. Try adding more lines with action-oriented language.")

        if st.session_state.get("cap_results"):
            results = st.session_state.cap_results
            st.markdown(f"**{len(results)} items found** — check the ones to add:")
            checks = []
            for i, r in enumerate(results):
                c1, c2, c3 = st.columns([0.05, 0.65, 0.3])
                with c1:
                    checks.append(st.checkbox("", key=f"cap_cb_{i}", value=True))
                with c2:
                    st.write(r["title"])
                with c3:
                    st.markdown(f"{type_tag(r['type'])} {pri_tag(r['priority'])}", unsafe_allow_html=True)
            if st.button("Add Checked to Inbox", type="primary"):
                added = 0
                for i, r in enumerate(results):
                    if checks[i]:
                        db["work_items"].append({
                            "id": new_id(), "title": r["title"], "type": r["type"],
                            "priority": r["priority"], "due_date": None,
                            "project_id": None, "person_id": None, "notes": "",
                            "done": False, "inboxed": True,
                            "created_at": datetime.now().isoformat(),
                        })
                        added += 1
                save_data()
                st.session_state.cap_results = []
                st.success(f"Added {added} item{'s' if added != 1 else ''} to Inbox")
                st.rerun()

    with tab2:
        uploaded = st.file_uploader("Upload screenshot", type=["png", "jpg", "jpeg", "webp"])
        if uploaded:
            st.image(uploaded, use_container_width=True)
            st.info("On-device OCR is available in the native iPad app. Here, paste the text from the screenshot in the **Text / Notes** tab to extract work items.")

# ═══════════════════════════════════════════════════════════════════════════════
# INBOX
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "inbox":
    st.title("Inbox")
    inbox_items = [w for w in db["work_items"] if w.get("inboxed") and not w.get("done")]

    if not inbox_items:
        st.success("Inbox zero! 🎉 All captured items have been processed.")
    else:
        col_a, col_b = st.columns([4, 1])
        with col_b:
            if st.button("Process All →", use_container_width=True):
                for w in inbox_items:
                    w["inboxed"] = False
                save_data(); st.rerun()

        for w in inbox_items:
            with st.expander(f"{'⚠ ' if is_overdue(w.get('due_date')) else ''}{w['title']}", expanded=False):
                c1, c2, c3 = st.columns(3)
                with c1:
                    new_type = st.selectbox("Type", list(TYPE_OPTIONS.keys()),
                                            index=list(TYPE_OPTIONS.keys()).index(w.get("type", "task")),
                                            format_func=lambda x: TYPE_OPTIONS[x],
                                            key=f"ib_type_{w['id']}")
                with c2:
                    new_pri = st.selectbox("Priority", ["high", "medium", "low"],
                                           index=["high", "medium", "low"].index(w.get("priority", "medium")),
                                           format_func=str.capitalize,
                                           key=f"ib_pri_{w['id']}")
                with c3:
                    proj_ids = [""] + [p["id"] for p in db["projects"]]
                    proj_names = ["No project"] + [p["name"] for p in db["projects"]]
                    proj_idx = proj_ids.index(w.get("project_id") or "")
                    new_proj = st.selectbox("Project", proj_ids, index=proj_idx,
                                            format_func=lambda x: proj_names[proj_ids.index(x)],
                                            key=f"ib_proj_{w['id']}")
                new_due = st.date_input("Due date", value=date.fromisoformat(w["due_date"]) if w.get("due_date") else None,
                                         key=f"ib_due_{w['id']}")
                notes = st.text_area("Notes", value=w.get("notes", ""), key=f"ib_notes_{w['id']}", height=80)

                ca, cb, cc = st.columns([1, 1, 3])
                with ca:
                    if st.button("✓ File", key=f"file_{w['id']}", type="primary"):
                        w.update({"type": new_type, "priority": new_pri,
                                  "project_id": new_proj or None,
                                  "due_date": new_due.isoformat() if new_due else None,
                                  "notes": notes, "inboxed": False})
                        save_data(); st.rerun()
                with cb:
                    if st.button("Delete", key=f"del_ib_{w['id']}"):
                        db["work_items"] = [i for i in db["work_items"] if i["id"] != w["id"]]
                        save_data(); st.rerun()

# ═══════════════════════════════════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "projects":
    st.title("Projects")
    col_title, col_btn = st.columns([4, 1])
    with col_btn:
        if st.button("+ New Project", type="primary", use_container_width=True):
            st.session_state.show_add_project = True

    # Add project form
    if st.session_state.get("show_add_project"):
        with st.form("add_proj_form", clear_on_submit=True):
            st.subheader("New Project")
            pname = st.text_input("Name *")
            pgoal = st.text_area("Goal / Outcome", height=80, placeholder="What does done look like?")
            pc1, pc2 = st.columns(2)
            with pc1:
                pstatus = st.selectbox("Status", ["active", "onHold", "completed"],
                                        format_func=lambda x: {"active": "Active", "onHold": "On Hold", "completed": "Completed"}[x])
            with pc2:
                pcolor = st.color_picker("Colour", "#1B5E9E")
            if st.form_submit_button("Create Project", type="primary") and pname.strip():
                db["projects"].append({"id": new_id(), "name": pname.strip(), "goal": pgoal,
                                        "status": pstatus, "color": pcolor,
                                        "created_at": datetime.now().isoformat()})
                save_data()
                st.session_state.show_add_project = False
                st.rerun()
            if st.form_submit_button("Cancel"):
                st.session_state.show_add_project = False
                st.rerun()

    if not db["projects"]:
        st.info("No projects yet. Create one to start tracking work.")
    else:
        sel = st.session_state.get("selected_project")
        proj_col, detail_col = st.columns([1, 2])

        with proj_col:
            for p in db["projects"]:
                items = [w for w in db["work_items"] if w.get("project_id") == p["id"]]
                open_count = len([w for w in items if not w.get("done")])
                done_count  = len([w for w in items if w.get("done")])
                total = open_count + done_count
                pct = int(done_count / total * 100) if total else 0
                active_label = {"active": "●", "onHold": "◐", "completed": "○"}[p.get("status", "active")]
                btn_label = f"{active_label} {p['name']}  ({open_count} open)"
                if st.button(btn_label, key=f"selp_{p['id']}", use_container_width=True):
                    st.session_state.selected_project = p["id"]
                    st.rerun()

        with detail_col:
            sel_id = st.session_state.get("selected_project")
            proj = next((p for p in db["projects"] if p["id"] == sel_id), None)
            if not proj:
                st.markdown('<div class="empty-state">← Select a project</div>', unsafe_allow_html=True)
            else:
                c1, c2 = st.columns([3, 1])
                with c1:
                    st.subheader(proj["name"])
                with c2:
                    if st.button("Edit", key="edit_proj"):
                        st.session_state.editing_project = proj["id"]

                if proj.get("goal"):
                    st.caption(proj["goal"])

                proj_items = [w for w in db["work_items"] if w.get("project_id") == sel_id]
                open_items = [w for w in proj_items if not w.get("done")]
                done_items = [w for w in proj_items if w.get("done")]
                total = len(proj_items)
                pct = int(len(done_items) / total * 100) if total else 0
                st.progress(pct / 100, text=f"{pct}% complete · {len(done_items)}/{total} done")

                # Add item to project
                if st.button("+ Add Item", key="add_proj_item", type="primary"):
                    st.session_state.show_add_proj_item = sel_id

                if st.session_state.get("show_add_proj_item") == sel_id:
                    with st.form("proj_item_form", clear_on_submit=True):
                        title = st.text_input("Title *")
                        cc1, cc2 = st.columns(2)
                        with cc1:
                            itype = st.selectbox("Type", list(TYPE_OPTIONS.keys()), format_func=lambda x: TYPE_OPTIONS[x])
                        with cc2:
                            ipri = st.selectbox("Priority", ["high","medium","low"], index=1, format_func=str.capitalize)
                        idue = st.date_input("Due date", value=None, key="proj_due")
                        if st.form_submit_button("Add", type="primary") and title.strip():
                            db["work_items"].append({
                                "id": new_id(), "title": title.strip(), "type": itype,
                                "priority": ipri, "due_date": idue.isoformat() if idue else None,
                                "project_id": sel_id, "person_id": None, "notes": "",
                                "done": False, "inboxed": False,
                                "created_at": datetime.now().isoformat(),
                            })
                            save_data()
                            st.session_state.show_add_proj_item = None
                            st.rerun()
                        if st.form_submit_button("Cancel"):
                            st.session_state.show_add_proj_item = None
                            st.rerun()

                st.markdown("**Open**")
                if not open_items:
                    st.caption("No open items.")
                for w in open_items:
                    wc1, wc2 = st.columns([0.05, 0.95])
                    with wc1:
                        done = st.checkbox("", key=f"pd_{w['id']}", value=False)
                        if done:
                            w["done"] = True; save_data(); st.rerun()
                    with wc2:
                        st.markdown(f"{type_tag(w.get('type','task'))} {w['title']} {due_html(w.get('due_date'))}", unsafe_allow_html=True)

                if done_items:
                    with st.expander(f"Completed ({len(done_items)})"):
                        for w in done_items:
                            st.markdown(f"~~{w['title']}~~")

# ═══════════════════════════════════════════════════════════════════════════════
# PEOPLE
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "people":
    st.title("People")
    c_title, c_btn = st.columns([4, 1])
    with c_btn:
        if st.button("+ Add Person", type="primary", use_container_width=True):
            st.session_state.show_add_person = True

    if st.session_state.get("show_add_person"):
        with st.form("add_person_form", clear_on_submit=True):
            st.subheader("Add Person")
            pn1, pn2 = st.columns(2)
            with pn1:
                pname = st.text_input("Name *")
            with pn2:
                prole = st.text_input("Role", placeholder="e.g. CFO, Tech Lead")
            pnotes = st.text_area("Notes", height=70)
            if st.form_submit_button("Add Person", type="primary") and pname.strip():
                db["people"].append({"id": new_id(), "name": pname.strip(), "role": prole, "notes": pnotes,
                                     "created_at": datetime.now().isoformat()})
                save_data()
                st.session_state.show_add_person = False
                st.rerun()
            if st.form_submit_button("Cancel"):
                st.session_state.show_add_person = False; st.rerun()

    if not db["people"]:
        st.info("No people added yet. Add people to track follow-ups and waiting items.")
    else:
        p_col, d_col = st.columns([1, 2])
        with p_col:
            for p in db["people"]:
                waiting = len([w for w in db["work_items"] if not w.get("done") and w.get("person_id") == p["id"] and w.get("type") == "waitingFor"])
                fu = len([w for w in db["work_items"] if not w.get("done") and w.get("person_id") == p["id"] and w.get("type") == "followUp"])
                lbl = f"{p['name']}"
                if waiting or fu:
                    lbl += f"  ({waiting}⏳ {fu}↩)"
                if st.button(lbl, key=f"selper_{p['id']}", use_container_width=True):
                    st.session_state.selected_person = p["id"]
                    st.rerun()

        with d_col:
            per_id = st.session_state.get("selected_person")
            person = next((p for p in db["people"] if p["id"] == per_id), None)
            if not person:
                st.markdown("← Select a person")
            else:
                st.subheader(person["name"])
                if person.get("role"):
                    st.caption(person["role"])
                if person.get("notes"):
                    st.info(person["notes"])

                per_items = [w for w in db["work_items"] if w.get("person_id") == per_id and not w.get("done")]
                waiting = [w for w in per_items if w.get("type") == "waitingFor"]
                followups = [w for w in per_items if w.get("type") == "followUp"]
                other = [w for w in per_items if w.get("type") not in ("waitingFor", "followUp")]

                if st.button("+ Add Follow Up", type="primary"):
                    st.session_state.show_add_per_item = per_id

                if st.session_state.get("show_add_per_item") == per_id:
                    with st.form("per_item_form", clear_on_submit=True):
                        ptitle = st.text_input("Title *")
                        ptype = st.selectbox("Type", ["followUp", "waitingFor", "task"],
                                              format_func=lambda x: TYPE_OPTIONS[x])
                        ppri = st.selectbox("Priority", ["high","medium","low"], index=1, format_func=str.capitalize)
                        pdue = st.date_input("Due", value=None, key="per_due")
                        if st.form_submit_button("Add", type="primary") and ptitle.strip():
                            db["work_items"].append({
                                "id": new_id(), "title": ptitle.strip(), "type": ptype,
                                "priority": ppri, "due_date": pdue.isoformat() if pdue else None,
                                "project_id": None, "person_id": per_id, "notes": "",
                                "done": False, "inboxed": False,
                                "created_at": datetime.now().isoformat(),
                            })
                            save_data()
                            st.session_state.show_add_per_item = None
                            st.rerun()
                        if st.form_submit_button("Cancel"):
                            st.session_state.show_add_per_item = None; st.rerun()

                if waiting:
                    st.markdown(f"**Waiting on {person['name'].split()[0]}**")
                    for w in waiting:
                        st.markdown(f"- {w['title']} {due_html(w.get('due_date'))}", unsafe_allow_html=True)
                if followups:
                    st.markdown("**Follow Ups**")
                    for w in followups:
                        st.markdown(f"- {w['title']} {due_html(w.get('due_date'))}", unsafe_allow_html=True)
                if other:
                    st.markdown("**Other**")
                    for w in other:
                        st.markdown(f"- {w['title']}", unsafe_allow_html=True)
                if not waiting and not followups and not other:
                    st.success("Nothing pending with this person.")

# ═══════════════════════════════════════════════════════════════════════════════
# DECISIONS
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "decisions":
    st.title("Decisions")
    dc1, dc2 = st.columns([4, 1])
    with dc2:
        if st.button("+ New Decision", type="primary", use_container_width=True):
            st.session_state.show_add_decision = True

    if st.session_state.get("show_add_decision"):
        with st.form("add_dec_form", clear_on_submit=True):
            st.subheader("New Decision")
            dtitle = st.text_input("Title *")
            dd1, dd2 = st.columns(2)
            with dd1:
                dstatus = st.selectbox("Status", ["pending", "decided", "deferred"],
                                        format_func=str.capitalize)
            with dd2:
                ddue = st.date_input("Due", value=None, key="dec_due")
            dcontext = st.text_area("Context", height=80, placeholder="Options, constraints, stakeholders…")
            doutcome = st.text_area("Outcome (once decided)", height=60, placeholder="What was decided and why?")
            if st.form_submit_button("Save Decision", type="primary") and dtitle.strip():
                db["decisions"].append({
                    "id": new_id(), "title": dtitle.strip(), "status": dstatus,
                    "due_date": ddue.isoformat() if ddue else None,
                    "context": dcontext, "outcome": doutcome,
                    "created_at": datetime.now().isoformat(),
                })
                save_data()
                st.session_state.show_add_decision = False
                st.rerun()
            if st.form_submit_button("Cancel"):
                st.session_state.show_add_decision = False; st.rerun()

    groups = {
        "pending": [d for d in db["decisions"] if d.get("status") == "pending"],
        "deferred": [d for d in db["decisions"] if d.get("status") == "deferred"],
        "decided": [d for d in db["decisions"] if d.get("status") == "decided"],
    }

    if not db["decisions"]:
        st.info("No decisions tracked yet. Add one to keep on top of pending choices.")

    for status, label, color in [("pending","Pending","🔴"), ("deferred","Deferred","🟡"), ("decided","Decided","🟢")]:
        items = groups[status]
        if not items:
            continue
        st.markdown(f"**{color} {label}** ({len(items)})")
        for d in items:
            with st.expander(d["title"], expanded=(status == "pending")):
                ec1, ec2 = st.columns(2)
                with ec1:
                    new_status = st.selectbox("Status", ["pending","decided","deferred"],
                                               index=["pending","decided","deferred"].index(d.get("status","pending")),
                                               format_func=str.capitalize,
                                               key=f"dec_st_{d['id']}")
                with ec2:
                    cur_due = date.fromisoformat(d["due_date"]) if d.get("due_date") else None
                    new_due = st.date_input("Due", value=cur_due, key=f"dec_due_{d['id']}")
                new_ctx = st.text_area("Context", value=d.get("context",""), height=80, key=f"dec_ctx_{d['id']}")
                new_out = st.text_area("Outcome", value=d.get("outcome",""), height=60, key=f"dec_out_{d['id']}")
                sb1, sb2 = st.columns([1, 4])
                with sb1:
                    if st.button("Save", key=f"dec_save_{d['id']}", type="primary"):
                        d.update({"status": new_status,
                                  "due_date": new_due.isoformat() if new_due else None,
                                  "context": new_ctx, "outcome": new_out})
                        save_data(); st.rerun()
                with sb2:
                    if st.button("Delete", key=f"dec_del_{d['id']}"):
                        db["decisions"] = [i for i in db["decisions"] if i["id"] != d["id"]]
                        save_data(); st.rerun()

# ═══════════════════════════════════════════════════════════════════════════════
# REVIEW
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "review":
    st.title("Weekly Review")
    st.caption("Systematically close out the week and set up the next one.")

    overdue_c  = len([w for w in db["work_items"] if not w.get("done") and is_overdue(w.get("due_date"))])
    inbox_c    = len([w for w in db["work_items"] if w.get("inboxed") and not w.get("done")])
    dec_c      = len([d for d in db["decisions"] if d.get("status") == "pending"])
    waiting_c  = len([w for w in db["work_items"] if not w.get("done") and w.get("type") == "waitingFor"])
    active_proj = len([p for p in db["projects"] if p.get("status") == "active"])

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Inbox", inbox_c, delta=-inbox_c if inbox_c else None, delta_color="inverse")
    col2.metric("Overdue", overdue_c, delta=-overdue_c if overdue_c else None, delta_color="inverse")
    col3.metric("Pending Decisions", dec_c)
    col4.metric("Waiting On Others", waiting_c)

    st.markdown("---")

    checklist = [
        ("📥 Process Inbox", inbox_c == 0, f"Clear {inbox_c} inbox items" if inbox_c else "Inbox clear ✓"),
        ("⚠️ Review Overdue", overdue_c == 0, f"Action {overdue_c} overdue items" if overdue_c else "No overdue items ✓"),
        ("⚖ Close Open Decisions", dec_c == 0, f"Resolve {dec_c} pending decisions" if dec_c else "No pending decisions ✓"),
        ("▤ Review Active Projects", False, f"Walk through {active_proj} active projects"),
        ("✦ Chase Waiting Items", waiting_c == 0, f"Follow up on {waiting_c} items" if waiting_c else "Nothing waiting ✓"),
        ("📅 Plan Next Week", False, "Schedule focus time and review upcoming deadlines"),
        ("🧠 Brain Dump", False, "Capture anything left in your head"),
    ]

    for label, done, sub in checklist:
        state_key = f"rev_{label}"
        checked = st.session_state.get(state_key, done)
        col_cb, col_text = st.columns([0.05, 0.95])
        with col_cb:
            new_val = st.checkbox("", key=f"rvcb_{label}", value=checked)
            st.session_state[state_key] = new_val
        with col_text:
            if new_val:
                st.markdown(f"~~**{label}**~~ — {sub}")
            else:
                st.markdown(f"**{label}** — {sub}")

    st.markdown("---")
    done_count = sum(1 for l, _, _ in checklist if st.session_state.get(f"rev_{l}", False))
    st.progress(done_count / len(checklist), text=f"{done_count}/{len(checklist)} steps complete")

# ═══════════════════════════════════════════════════════════════════════════════
# SEARCH
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "search":
    st.title("Search")
    q = st.text_input("", placeholder="Search everything…", label_visibility="collapsed")

    if q and len(q) >= 2:
        ql = q.lower()
        results = []
        for w in db["work_items"]:
            if ql in w.get("title","").lower() or ql in w.get("notes","").lower():
                results.append(("Item", w["title"], f"{TYPE_OPTIONS.get(w.get('type','task'),'Task')} · {w.get('priority','medium').capitalize()}"))
        for d in db["decisions"]:
            if ql in d.get("title","").lower() or ql in d.get("context","").lower():
                results.append(("Decision", d["title"], d.get("status","").capitalize()))
        for p in db["projects"]:
            if ql in p.get("name","").lower() or ql in p.get("goal","").lower():
                results.append(("Project", p["name"], p.get("status","active").capitalize()))
        for p in db["people"]:
            if ql in p.get("name","").lower() or ql in p.get("role","").lower():
                results.append(("Person", p["name"], p.get("role","")))

        if not results:
            st.info(f"No results for **{q}**")
        else:
            st.caption(f"{len(results)} result{'s' if len(results)!=1 else ''}")
            for rtype, rtitle, rsub in results:
                type_color = {"Item":"#1B5E9E","Decision":"#6B3FA0","Project":"#1A7F37","Person":"#0E7490"}.get(rtype,"#6B6B6B")
                st.markdown(f"""
                <div class="cadence-card">
                  <span class="tag" style="background:{type_color}20;color:{type_color}">{rtype}</span>
                  <b style="font-size:14px"> {rtitle}</b>
                  <div style="font-size:12px;color:#6B6B6B;margin-top:2px">{rsub}</div>
                </div>""", unsafe_allow_html=True)
    elif not q:
        total = len(db["work_items"])
        done  = len([w for w in db["work_items"] if w.get("done")])
        st.markdown(f"""
        <div style="display:flex;gap:20px;margin-top:8px">
          <div class="cadence-card" style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#1B5E9E">{total}</div><div style="color:#6B6B6B;font-size:13px">Total items</div></div>
          <div class="cadence-card" style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#1A7F37">{done}</div><div style="color:#6B6B6B;font-size:13px">Completed</div></div>
          <div class="cadence-card" style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#6B3FA0">{len(db['projects'])}</div><div style="color:#6B6B6B;font-size:13px">Projects</div></div>
          <div class="cadence-card" style="flex:1;text-align:center"><div style="font-size:28px;font-weight:700;color:#0E7490">{len(db['people'])}</div><div style="color:#6B6B6B;font-size:13px">People</div></div>
        </div>""", unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════
elif page == "settings":
    st.title("Settings")

    st.subheader("Profile")
    name = st.text_input("Your name", value=db.get("settings", {}).get("name", ""))
    if st.button("Save name"):
        db.setdefault("settings", {})["name"] = name
        save_data(); st.success("Saved")

    st.subheader("Privacy & Data")
    st.markdown("""
    <div class="cadence-card">
      <div><b>All data is stored locally</b></div>
      <div style="color:#6B6B6B;font-size:13px;margin-top:4px">
        Data is saved to <code>cadence_data.json</code> in the app directory.
        Nothing is sent to any server, API, or external service.
      </div>
    </div>""", unsafe_allow_html=True)

    st.subheader("Export / Import")
    col_exp, col_imp = st.columns(2)
    with col_exp:
        json_str = json.dumps(db, indent=2)
        st.download_button(
            "⬇ Export JSON",
            data=json_str,
            file_name=f"cadence-backup-{today_str()}.json",
            mime="application/json",
            use_container_width=True,
        )
    with col_imp:
        uploaded_json = st.file_uploader("⬆ Import JSON", type="json", label_visibility="collapsed")
        if uploaded_json:
            try:
                imported = json.loads(uploaded_json.read())
                if "work_items" not in imported:
                    st.error("Invalid Cadence backup file.")
                else:
                    if st.button("Confirm Import (overwrites current data)"):
                        db.clear(); db.update(imported)
                        save_data(); st.success("Imported."); st.rerun()
            except Exception:
                st.error("Could not read file.")

    st.subheader("Danger Zone")
    if st.button("🗑 Clear All Data", type="secondary"):
        st.session_state.confirm_clear = True
    if st.session_state.get("confirm_clear"):
        st.warning("This will delete everything. Are you sure?")
        cc1, cc2 = st.columns(2)
        with cc1:
            if st.button("Yes, delete everything", type="primary"):
                db.clear(); db.update({"work_items":[],"projects":[],"people":[],"decisions":[]})
                save_data()
                st.session_state.confirm_clear = False
                st.success("Cleared."); st.rerun()
        with cc2:
            if st.button("Cancel"):
                st.session_state.confirm_clear = False; st.rerun()

    st.markdown("---")
    st.caption("Cadence — Executive Operating System · All data stored locally")
