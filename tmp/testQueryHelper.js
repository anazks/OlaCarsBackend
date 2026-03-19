const { applyQueryFeatures } = require('../Src/shared/utils/queryHelper');

// Mock Mongoose Model
const MockModel = {
    countDocuments: async (query) => {
        console.log('Count Query:', JSON.stringify(query, null, 2));
        return 10;
    },
    find: (query) => {
        console.log('Find Query:', JSON.stringify(query, null, 2));
        return {
            sort: () => ({
                skip: () => ({
                    limit: () => []
                })
            })
        };
    }
};

async function test() {
    console.log('--- Test 1: Start and End Date ---');
    await applyQueryFeatures(MockModel, { 
        startDate: '2023-01-01', 
        endDate: '2023-01-31' 
    }, { 
        dateFilterField: 'createdAt' 
    });

    console.log('\n--- Test 2: Only Start Date ---');
    await applyQueryFeatures(MockModel, { 
        startDate: '2023-01-01' 
    }, { 
        dateFilterField: 'createdAt' 
    });

    console.log('\n--- Test 3: Only End Date ---');
    await applyQueryFeatures(MockModel, { 
        endDate: '2023-01-31' 
    }, { 
        dateFilterField: 'createdAt' 
    });
}

test().catch(console.error);
