import re

with open("frontend/src/screens/Problems.jsx", "r") as f:
    content = f.read()

# 1. Update ID mapping since the backend now returns dynamic queries without an integer `id`
content = content.replace("p.id", "p.server_id + '-' + p.metric_type")
content = content.replace("selected.id", "selected.server_id + '-' + selected.metric_type")
content = content.replace("effectiveSelected === p.id", "effectiveSelected === (p.server_id + '-' + p.metric_type)")
content = content.replace("PROBLEM #{problem.id}", "PROBLEM {problem.server_id}-{problem.metric_type.substring(0,3)}")

# 2. Since `store.problemTimelines[selected.id]` is no longer valid, we should disable fetching timeline
# by removing the `useEffect` and `fetchProblemTimeline` usage for now, since it's an advanced feature.
timeline_use_effect = re.compile(r'  useEffect\(\(\) => \{.*?\}, \[selected\?\.id\]\);\n', re.DOTALL)
content = timeline_use_effect.sub('', content)

# Remove timeline usage
content = content.replace("const timeline = selected ? store.problemTimelines[selected.id] || [] : [];", "const timeline = [];")

with open("frontend/src/screens/Problems.jsx", "w") as f:
    f.write(content)

print("frontend/src/screens/Problems.jsx updated!")
