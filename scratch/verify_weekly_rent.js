const mongoose = require('mongoose');
const DriverService = require('../Src/modules/Driver/Service/DriverService');

async function testWeeklyRent() {
    console.log("Testing Weekly Rent Generation Logic...");
    
    // Mock the repo/model dependencies if necessary or just run logic test
    const mockDriverId = new mongoose.Types.ObjectId();
    const weeklyRent = 1500;
    const durationWeeks = 260; // 5 years

    // Since generateRentPlan calls updateDriverService, we might want to just test the array generation logic
    // but here I'll just check if the logic in DriverService.js is sound.
    
    const installments = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7); // Next week
    startDate.setHours(0, 0, 0, 0);

    for (let i = 0; i < 4; i++) { // Test first 4 weeks
        const dueDate = new Date(startDate.getTime());
        dueDate.setDate(startDate.getDate() + (i * 7));
        
        const weekNum = i + 1;
        installments.push({
            weekNumber: weekNum,
            weekLabel: `Week ${weekNum} - ${dueDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
            dueDate: dueDate,
            amount: weeklyRent,
            status: "PENDING"
        });
    }

    console.log("First 4 installments:");
    console.log(JSON.stringify(installments, null, 2));

    const lastDueDate = new Date(startDate.getTime());
    lastDueDate.setDate(startDate.getDate() + ((durationWeeks - 1) * 7));
    console.log(`Last installment (Week ${durationWeeks}) due date: ${lastDueDate.toDateString()}`);
}

testWeeklyRent();
