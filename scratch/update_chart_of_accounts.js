const fs = require('fs');
const path = require('path');

const targetPath = 'C:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\pages\\dashboards\\finance\\ChartOfAccounts.tsx';
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Add import
if (!content.includes("SearchableSelect")) {
    content = content.replace(
        "import Breadcrumbs from '../../../components/dashboard/shared/Breadcrumbs';",
        "import Breadcrumbs from '../../../components/dashboard/shared/Breadcrumbs';\nimport SearchableSelect from '../../../components/common/SearchableSelect';"
    );
}

// 2. Add memoized parent options
const memoOptionsCode = `
    const parentSelectOptions = useMemo(() => {
        return [
            { value: '', label: '- None -' },
            ...allParentOptions.map(c => {
                const id = c._id || (c as any).id;
                return {
                    value: id,
                    label: \`\${c.code} - \${c.name} \${c.accountType ? \`(\${c.accountType})\` : \`(\${c.category})\`}\`
                };
            })
        ];
    }, [allParentOptions]);

    const editParentSelectOptions = useMemo(() => {
        const currentId = editingCode ? (editingCode._id || (editingCode as any)?.id) : null;
        return [
            { value: '', label: '- None -' },
            ...allParentOptions
                .filter(c => (c._id || (c as any).id) !== currentId)
                .map(c => {
                    const id = c._id || (c as any).id;
                    return {
                        value: id,
                        label: \`\${c.code} - \${c.name} \${c.accountType ? \`(\${c.accountType})\` : \`(\${c.category})\`}\`
                    };
                })
        ];
    }, [allParentOptions, editingCode]);
`;

if (!content.includes("parentSelectOptions")) {
    content = content.replace(
        "const parentMap = useMemo(() => {",
        memoOptionsCode + "\n    const parentMap = useMemo(() => {"
    );
}

// 3. Replace select in Add Code form
const targetAddSelect = `<select
                                    value={newCode.parentAccount || ''}
                                    onChange={e => setNewCode({ ...newCode, parentAccount: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl outline-none text-sm transition-colors focus:ring-2 focus:ring-lime"
                                    style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-main)', color: 'var(--text-main)' }}
                                >
                                    <option value="">- None -</option>
                                    {allParentOptions.map(c => {
                                        const id = c._id || (c as any).id;
                                        return (
                                            <option key={id} value={id}>
                                                {c.code} - {c.name} {c.accountType ? \`(\${c.accountType})\` : \`(\${c.category})\`}
                                            </option>
                                        );
                                    })}
                                </select>`;

const replacementAddSelect = `<SearchableSelect
                                    options={parentSelectOptions}
                                    value={newCode.parentAccount || ''}
                                    onChange={val => setNewCode({ ...newCode, parentAccount: val })}
                                    placeholder="- None -"
                                />`;

content = content.replace(targetAddSelect, replacementAddSelect);

// 4. Replace select in Edit Code form
const targetEditSelect = `<select
                                    value={editPayload.parentAccount || ''}
                                    onChange={e => setEditPayload({ ...editPayload, parentAccount: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl outline-none text-sm transition-colors focus:ring-2 focus:ring-lime"
                                    style={{ background: 'var(--bg-sidebar)', border: '1px solid var(--border-main)', color: 'var(--text-main)' }}
                                >
                                    <option value="">- None -</option>
                                    {allParentOptions
                                        .filter(c => (c._id || (c as any).id) !== (editingCode?._id || (editingCode as any)?.id))
                                        .map(c => {
                                            const id = c._id || (c as any).id;
                                            return (
                                                <option key={id} value={id}>
                                                    {c.code} - {c.name} {c.accountType ? \`(\${c.accountType})\` : \`(\${c.category})\`}
                                                </option>
                                            );
                                        })}
                                </select>`;

const replacementEditSelect = `<SearchableSelect
                                    options={editParentSelectOptions}
                                    value={editPayload.parentAccount || ''}
                                    onChange={val => setEditPayload({ ...editPayload, parentAccount: val })}
                                    placeholder="- None -"
                                />`;

content = content.replace(targetEditSelect, replacementEditSelect);

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully updated ChartOfAccounts.tsx');
