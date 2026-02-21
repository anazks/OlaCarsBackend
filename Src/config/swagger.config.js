const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Ola Cars Fleet Management API",
      version: "1.0.0",
      description: "Multi-Branch Fleet ERP API Documentation",
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },

  // 🔥 Scan ALL route files inside modules
  apis: ["./Src/modules/*/Routes/*.js"],

};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;