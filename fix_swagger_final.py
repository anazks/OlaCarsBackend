import os
import re

def fix_swagger_formatting(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Remove blank lines between type: string and example:
    # Pattern: type: string followed by one or more blank lines (with optional spaces and asterisk) and then example:
    pattern1 = re.compile(r'(type:\s*string\s*\n\s*\*\s*)\n(\s*\*\s+example:)', re.MULTILINE)
    new_content = pattern1.sub(r'\1\2', content)
    
    # Repeat pattern 1 to catch multiple instances if needed
    for _ in range(5):
        new_content = pattern1.sub(r'\1\2', new_content)

    # 2. Specifically fix the case where there's a completely empty line (no asterisk) between type and example
    pattern2 = re.compile(r'(type:\s*string\s*\r?\n)\s*\r?\n(\s*\*\s+example:)', re.MULTILINE)
    new_content = pattern2.sub(r'\1\2', new_content)

    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    base_dir = r'c:\Users\leno2\Desktop\OlaCarsBackend\Src\modules'
    modified_count = 0
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('Routes.js') or file.endswith('Router.js'):
                file_path = os.path.join(root, file)
                if fix_swagger_formatting(file_path):
                    print(f"Fixed: {file_path}")
                    modified_count += 1
    
    print(f"Total files modified: {modified_count}")

if __name__ == "__main__":
    main()
