/**
 * check_staff_report.js
 * READ-ONLY — checks why staff-performance returns empty
 * No writes, no model changes.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected.\n");

        const db = mongoose.connection.db;

        // ── 1. Check each staff collection ──────────────────────────
        const collections = [
            "financestaffs",
            "operationstaffs",
            "workshopstaffs",
            "workshopmanagers"
        ];

        console.log("═══════════════════════════════════════════");
        console.log(" STAFF COLLECTIONS — Row counts");
        console.log("═══════════════════════════════════════════");

        let totalStaff = 0;
        for (const col of collections) {
            try {
                const count = await db.collection(col).countDocuments({ isDeleted: { $ne: true } });
                console.log(`  ${col}: ${count} active documents`);
                totalStaff += count;

                if (count > 0) {
                    const sample = await db.collection(col).findOne({ isDeleted: { $ne: true } });
                    console.log(`    Sample → fullName: "${sample?.fullName}", status: "${sample?.status}", branchId: ${sample?.branchId}`);
                }
            } catch (e) {
                console.log(`  ${col}: collection not found or error — ${e.message}`);
            }
        }

        console.log(`\nTotal staff across all collections: ${totalStaff}`);

        if (totalStaff === 0) {
            console.log("\n⚠️  NO STAFF DOCUMENTS EXIST IN DB — Staff Metrics will always be empty.");
            console.log("   You need to create at least one FinanceStaff/OperationStaff/WorkshopStaff user.");
            process.exit(0);
        }

        // ── 2. Check Tasks ───────────────────────────────────────────
        console.log("\n═══════════════════════════════════════════");
        console.log(" TASKS COLLECTION");
        console.log("═══════════════════════════════════════════");
        try {
            const taskCount = await db.collection("tasks").countDocuments();
            console.log(`  Total tasks: ${taskCount}`);
            if (taskCount > 0) {
                const sample = await db.collection("tasks").findOne();
                console.log(`  Sample task → status: "${sample?.status}", assignedTo: ${sample?.assignedTo}`);

                const statusBreakdown = await db.collection("tasks").aggregate([
                    { $group: { _id: "$status", count: { $sum: 1 } } }
                ]).toArray();
                console.log("  Status breakdown:");
                statusBreakdown.forEach(s => console.log(`    ${s._id}: ${s.count}`));
            }
        } catch (e) {
            console.log(`  tasks: error — ${e.message}`);
        }

        // ── 3. Check Targets for STAFF ───────────────────────────────
        console.log("\n═══════════════════════════════════════════");
        console.log(" TARGETS COLLECTION (targetType = STAFF)");
        console.log("═══════════════════════════════════════════");
        try {
            const targetCount = await db.collection("targets").countDocuments({ targetType: "STAFF" });
            console.log(`  Staff targets: ${targetCount}`);
        } catch (e) {
            console.log(`  targets: error — ${e.message}`);
        }

        // ── 4. Check STAFF_PERFORMANCE_VIEW permission on logged-in roles ──
        console.log("\n═══════════════════════════════════════════");
        console.log(" ROLE TEMPLATES — Has STAFF_PERFORMANCE_VIEW?");
        console.log("═══════════════════════════════════════════");
        try {
            const templates = await db.collection("roletemplates").find({}).toArray();
            if (templates.length === 0) {
                console.log("  ⚠️  No RoleTemplates found in DB!");
            } else {
                templates.forEach(t => {
                    const hasPerm = t.permissions?.includes("STAFF_PERFORMANCE_VIEW");
                    console.log(`  ${t.roleName}: ${hasPerm ? "✅ HAS" : "❌ MISSING"} STAFF_PERFORMANCE_VIEW`);
                });
            }
        } catch (e) {
            console.log(`  roletemplates: error — ${e.message}`);
        }

        // ── 5. Check what the actual query returns (simulate the service) ──
        console.log("\n═══════════════════════════════════════════");
        console.log(" SIMULATING getStaffPerformanceReport (no filters = admin case)");
        console.log("═══════════════════════════════════════════");

        const staffQuery = { isDeleted: { $ne: true } };

        const finStaff = await db.collection("financestaffs").find(staffQuery).toArray();
        const opStaff  = await db.collection("operationstaffs").find(staffQuery).toArray();
        const wsStaff  = await db.collection("workshopstaffs").find(staffQuery).toArray();
        const wsMgr    = await db.collection("workshopmanagers").find(staffQuery).toArray();

        const allStaff = [
            ...finStaff.map(s => ({ ...s, _role: "FINANCESTAFF" })),
            ...opStaff.map(s  => ({ ...s, _role: "OPERATIONSTAFF" })),
            ...wsStaff.map(s  => ({ ...s, _role: "WORKSHOPSTAFF" })),
            ...wsMgr.map(s    => ({ ...s, _role: "WORKSHOPMANAGER" })),
        ];

        console.log(`  Staff found by simulation: ${allStaff.length}`);
        allStaff.forEach((s, i) => {
            console.log(`  [${i+1}] ${s._role} — fullName: "${s.fullName}", _id: ${s._id}, isDeleted: ${s.isDeleted}`);
        });

        if (allStaff.length === 0) {
            console.log("\n⚠️  CONFIRMED: The staff query returns 0 results.");
            console.log("   Check if field 'isDeleted' exists and is set correctly on staff documents.");

            // Try without isDeleted filter
            const rawCount = await db.collection("financestaffs").countDocuments();
            const rawOpCount = await db.collection("operationstaffs").countDocuments();
            console.log(`\n   Raw counts (ignoring isDeleted):`);
            console.log(`     financestaffs: ${rawCount}`);
            console.log(`     operationstaffs: ${rawOpCount}`);

            const sample = await db.collection("financestaffs").findOne();
            if (sample) {
                console.log(`\n   Sample FinanceStaff raw doc keys: ${Object.keys(sample).join(", ")}`);
                console.log(`   isDeleted value: ${sample.isDeleted} (type: ${typeof sample.isDeleted})`);
            }
        }

        console.log("\n✅ Done. No data was written.\n");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
};

check();
