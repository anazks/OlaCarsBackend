async function testUpdate() {
    try {
        const loginRes = await fetch('http://localhost:3000/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@olacars.com', password: '1234@qwer' })
        });
        const loginData = await loginRes.json();
        const token = loginData.accessToken || loginData.data?.accessToken || loginData.token || loginData.data?.token;
        if (!token) throw new Error("No token returned");
        console.log("Logged in successfully.");

        const fetchRes = await fetch('http://localhost:3000/api/accounting-code', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const fetchData = await fetchRes.json();
        const codes = fetchData.data;
        if (!codes || codes.length === 0) return console.log("No codes found.");

        const codeToUpdate = codes[0];
        console.log(`Original Code: ${codeToUpdate.code}`);
        const newCode = codeToUpdate.code + "99";
        
        const updateRes = await fetch(`http://localhost:3000/api/accounting-code/${codeToUpdate._id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: newCode, name: codeToUpdate.name, category: codeToUpdate.category })
        });
        const updateData = await updateRes.json();
        console.log("Update response:", updateData);

        // Revert
        await fetch(`http://localhost:3000/api/accounting-code/${codeToUpdate._id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: codeToUpdate.code, name: codeToUpdate.name, category: codeToUpdate.category })
        });
        console.log("Revert successful.");
    } catch (err) {
        console.error("Test failed:", err.message);
    }
}
testUpdate();
