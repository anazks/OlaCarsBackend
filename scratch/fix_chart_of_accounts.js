const fs = require('fs');

const targetPath = 'C:\\Users\\anton\\OneDrive\\Documents\\vs coding\\olaCarsFrontEnd\\src\\pages\\dashboards\\finance\\ChartOfAccounts.tsx';
let content = fs.readFileSync(targetPath, 'utf8');

// 1. Remove the misplaced memoized options if present before editingCode
const misplacedBlock = `    const parentSelectOptions = useMemo(() => {
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
    }, [allParentOptions, editingCode]);\n\n`;

content = content.replace(misplacedBlock, '');

// 2. Place it after `const [isEditing, setIsEditing] = useState(false);`
const correctPlacementTarget = "const [isEditing, setIsEditing] = useState(false);";
const memoOptionsCode = `const [isEditing, setIsEditing] = useState(false);

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
    }, [allParentOptions, editingCode]);`;

if (!content.includes("parentSelectOptions")) {
    content = content.replace(correctPlacementTarget, memoOptionsCode);
} else {
    // If it was already placed somewhere else, ensure it is moved after state declarations
    content = content.replace(misplacedBlock, '');
    content = content.replace(correctPlacementTarget, memoOptionsCode);
}

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully fixed position of parentSelectOptions in ChartOfAccounts.tsx');
