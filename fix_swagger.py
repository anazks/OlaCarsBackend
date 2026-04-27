import os
import re

target_dir = os.path.join(os.path.dirname(__file__), 'Src', 'modules')

# This regex finds:
# 1. Any amount of spaces and a star, then `type: string`
# 2. Followed by any amount of whitespace (including newlines and other stars)
# 3. Followed by `example: "..."`
# And replaces it with just the type and example aligned.

pattern = re.compile(r'^(\s*\*\s+)type:\s*string\s*\r?\n(?:\s*\*\s*\r?\n)*\s*\*\s+example:\s*(".+?")\s*\r?\n', re.MULTILINE)

modified_files = []

for root, dirs, files in os.walk(target_dir):
    for file in files:
        if file.endswith('Routes.js') or file.endswith('Router.js'):
            file_path = os.path.join(root, file)
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # We need to replace it carefully. We will use a function.
            def replacer(match):
                indent = match.group(1)
                example_val = match.group(2)
                return f"{indent}type: string\n{indent}example: {example_val}\n"

            new_content, count = pattern.subn(replacer, content)

            # Also catch cases where the newline was completely blank (no star)
            pattern2 = re.compile(r'^(\s*\*\s+)type:\s*string\s*\r?\n(?:\s*\r?\n)*\s*\*\s+example:\s*(".+?")\s*\r?\n', re.MULTILINE)
            new_content, count2 = pattern2.subn(replacer, new_content)

            if count > 0 or count2 > 0:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                modified_files.append(file_path)

print(f"Fixed {len(modified_files)} files.")
