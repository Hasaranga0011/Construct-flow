import sys

with open('api/routes/labour.py', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'att_res = supabase.table("attendance")' in line:
        skip = True
        new_lines.append('        att_res = supabase.table("labour") \\\n')
        new_lines.append('            .select("worker_name, hours_worked") \\\n')
        new_lines.append('            .eq("project_id", payload.site_id) \\\n')
        new_lines.append('            .gte("date", payload.start_date) \\\n')
        new_lines.append('            .lte("date", payload.end_date) \\\n')
        new_lines.append('            .execute()\n')
    elif 'if not att_res.data:' in line and skip:
        skip = False
        new_lines.append(line)
    elif 'for row in att_res.data:' in line:
        skip = True
        new_lines.append('        for row in att_res.data:\n')
        new_lines.append('            wname = row.get("worker_name")\n')
        new_lines.append('            if not wname: continue\n')
        new_lines.append('            hrs = row.get("hours_worked") or 0\n')
        new_lines.append('            if wname not in worker_stats:\n')
        new_lines.append('                worker_stats[wname] = {"days": 0, "overtime_hours": 0}\n')
        new_lines.append('                \n')
        new_lines.append('            worker_stats[wname]["days"] += 1\n')
        new_lines.append('            if hrs > 8:\n')
        new_lines.append('                worker_stats[wname]["overtime_hours"] += (hrs - 8)\n')
        new_lines.append('                \n')
        new_lines.append('        worker_names = list(worker_stats.keys())\n')
        new_lines.append('        prof_res = supabase.table("profiles").select("id, full_name, daily_rate").in_("full_name", worker_names).execute()\n')
        new_lines.append('        \n')
        new_lines.append('        profiles_by_name = {p["full_name"]: p for p in (prof_res.data or [])}\n')
        new_lines.append('        \n')
        new_lines.append('        slips_to_insert = []\n')
        new_lines.append('        for wname, stats in worker_stats.items():\n')
        new_lines.append('            prof = profiles_by_name.get(wname)\n')
        new_lines.append('            if not prof: continue\n')
        new_lines.append('            wid = prof["id"]\n')
        new_lines.append('            daily_rate = prof.get("daily_rate") or 1000.0\n')
    elif 'base_salary = stats["days"] * daily_rate' in line and skip:
        skip = False
        new_lines.append(line)
    elif not skip:
        new_lines.append(line)

with open('api/routes/labour.py', 'w') as f:
    f.writelines(new_lines)
print('Done!')
