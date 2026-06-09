const FixedAssetService = require("./modules/FixedAsset/Service/FixedAssetService");

const payload = {
  purchasePrice: 24000,
  residualValue: 4000,
  usefulLifeYears: 5,
  depreciationInterval: "Monthly",
  purchaseDate: "2026-06-08",
  purchaseValue: 24000,
  disposalValue: 0,
  depreciationStartDate: "2026-06-08",
  assetLife: 60,
  assetLifeUnit: "Months"
};

async function run() {
    const preview = await FixedAssetService.previewDepreciationSchedule(payload);
    console.log("PREVIEW SCHEDULE ENTRIES COUNT:", preview.length);
    console.log("FIRST ENTRY:", preview[0]);
    console.log("SECOND ENTRY:", preview[1]);
    console.log("LAST ENTRY:", preview[preview.length - 1]);
}

run();
