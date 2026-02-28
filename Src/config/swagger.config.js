const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Ola Cars Fleet Management API",
      version: "1.0.0",
      description: "Multi-Branch Fleet ERP API Documentation",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
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