import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the Daily option lines
content = re.sub(r'^[ \t]*<option value="daily">Daily</option>\n', '', content, flags=re.MULTILINE)

# Remove the -day select elements
content = re.sub(r'<select class="ds-select" id="[a-zA-Z0-9]+-day" onchange="handleDS\(\'[a-zA-Z0-9]+\'\)" disabled><option value="">Day</option></select>', '', content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
