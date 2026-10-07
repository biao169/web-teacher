"""Public student grouping: configured order, first matching enabled rule, SQL pagination."""
import json
from .catalog import Error
from .student_categories import parse_keywords,MATCH_FIELDS,ASCII_LOWER

async def rules_for(content):
    rows=await content.sql.query('SELECT uid,label,label_en,keywords FROM student_category_displays WHERE enabled=1 ORDER BY display_order,id')
    rules=[]
    for row in rows:
        try:words=parse_keywords(row['keywords'])
        except Error:continue # Legacy invalid rules can still be repaired in the existing editor.
        if words:rules.append({'uid':row['uid'],'label':row['label'],'label_en':row['label_en'],'words':[w.translate(ASCII_LOWER) for w in words]})
    return rules

def group_expression(rules):
    # json_each packs all terms into ONE binding (also within D1's parameter budget).
    # instr is literal substring matching: %, _ and backslash are not wildcards.
    joined="lower("+" || ' ' || ".join(f'coalesce(students."{field}",\'\')' for field in MATCH_FIELDS)+")"
    expression="coalesce((SELECT CAST(rule.key AS INTEGER) FROM json_each(?) AS rule WHERE EXISTS (SELECT 1 FROM json_each(rule.value,'$.words') AS word WHERE instr("+joined+",word.value)>0) ORDER BY CAST(rule.key AS INTEGER) LIMIT 1),"+str(len(rules))+")"
    return expression,[json.dumps(rules,ensure_ascii=False,separators=(',',':'))]

def annotate(rows,rules):
    for row in rows:
        joined=' '.join(str(row.get(f) or '') for f in MATCH_FIELDS).translate(ASCII_LOWER)
        match=next((rule for rule in rules if any(word in joined for word in rule['words'])),None)
        row['_public_group']=match['uid'] if match else '_other'
        row['_public_group_label']=match['label'] if match else '其他学生'
        row['_public_group_label_en']=(match['label_en'] or match['label']) if match else 'Other students'
