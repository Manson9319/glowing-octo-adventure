require("dotenv").config();
const { setupHeaders } = require("../sheets/googleSheets");

console.log("Setting up Google Sheet headers...");
setupHeaders()
  .then(() => {
    console.log("Done! Your Google Sheet is ready for meal tracking.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Setup failed:", err.message);
    process.exit(1);
  });
