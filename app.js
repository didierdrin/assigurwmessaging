// APP
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import { firestore, firestore2, firestore3, storage } from "./firebaseConfig.js";
import http from "http";
import https from "https";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { CalculatePricing } from './pricing.js';
import { VehicleModel } from './vehicle.js';

//import { extractImageData } from './imageExtraction.js';
const bucketName = "assigurw.appspot.com";
const bucket = storage.bucket(bucketName);

dotenv.config();

// Custom HTTP and HTTPS Agents
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

// Set longer timeout and more robust connection settings
axios.defaults.timeout = 60000 * 3; // 3 minutes
axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://assigurwmessaging-1u57.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(bodyParser.json());

// WhatsApp API Credentials
const ACCESS_TOKEN =
  "EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";//"EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD"; //"EAA1kZAGvg8CkBO7CvHgw7vOETU2TPYwnzqBtJMKm08L3u3iaCau2J98glnWGkbx1A80bHrCvRK8lZA4ZB4diboE0ACxtqUOG4bR0LU6uqUWxsd6cRRaDQZBJTJt6LDLZCEMKw4h87ixIhRyTfwoSzphuUMDCVjsQBmOjsWCqn0WhcWTS7UESldlis6OL5fz0Tp7teEsKX8iIWOcoAVZAf3SEF1lfMZD";//"EAAGHrMn6uugBO9xlSTNU1FsbnZB7AnBLCvTlgZCYQDZC8OZA7q3nrtxpxn3VgHiT8o9KbKQIyoPNrESHKZCq2c9B9lvNr2OsT8YDBewaDD1OzytQd74XlmSOgxZAVL6TEQpDT43zZCZBwQg9AZA5QPeksUVzmAqTaoNyIIaaqSvJniVmn6dW1rw88dbZAyR6VZBMTTpjQZDZD";//"EAA1kZAGvg8CkBO24xE3Nh1NvIOrZAHhEt6N1w6LBa0gLxpK3KZCYZBBeFroUunZCYvJhwFgXblw2rsxkRLkAThSSHgmzvO2ArQKq9kvsHkQQSzrK7pYy0bJktsrPzad3XLbpVwgG9WDbz2ZC5DHLtee99GMjqXxM9C3RbZBZALGz7n7dYl6ydJwMYagLADh0TAZCrOC3MiTe7Yq3Tvx4n9pKISPZB5QIsZD";

const VERSION = "v22.0";

// Global in-memory store for user contexts
const userContexts = new Map();
// Function to dynamically add new cases to handleTextMessages
const textMessageCases = new Map();


// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// Update the plate number validation function
function validatePlateNumber(plateNumber) {
  // More flexible validation
  const cleanedPlateNumber = plateNumber.replace(/\s+/g, "").toUpperCase();

  // Relaxed regex to match various plate number formats
  const plateNumberRegex = /^[A-Z]{2,3}\d{2,4}[A-Z]?$/;

  console.log("Plate Number Validation:", {
    input: plateNumber,
    cleaned: cleanedPlateNumber,
    isValid: plateNumberRegex.test(cleanedPlateNumber),
  });

  return {
    isValid: plateNumberRegex.test(cleanedPlateNumber),
    formattedPlateNumber: cleanedPlateNumber,
  };
}

const validateDate = (dateString) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD format
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

//// From here - readable modular functions.

const handlePlateNumberValidation = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};
  const messageText = message.text.body.trim().toLowerCase();
  const PLATE_NUMBER_REGEX = /^[a-zA-Z]{3}\s?\d{3}[a-zA-Z]?$/i;

  // Check if we're expecting a plate number
  if (PLATE_NUMBER_REGEX.test(messageText)) {
    const plateNumberInput = message.text.body.trim();
    const { isValid, formattedPlateNumber } =
      validatePlateNumber(plateNumberInput);

    console.log("Plate Number Validation Result:", {
      input: plateNumberInput,
      isValid: isValid,
      formattedPlateNumber: formattedPlateNumber,
    });

    if (isValid) {
      await selectInsurancePeriod(phone, formattedPlateNumber, phoneNumberId);
    } else {
      // Send error message for invalid plate number
      const errorPayload = {
        type: "text",
        text: {
          body: "Invalid plate number format. Please use a valid format like RAC345T or RAC 345 T:",
        },
      };
      await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);

      // Optional: Re-trigger plate number request
      await requestVehiclePlateNumber(phone, phoneNumberId);
    }
  }
};


const handleDateValidation = async (message, phone, phoneNumberId) => {
  const DATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  const messageText = message.text.body.trim();

  // Validate date format
  if (DATE_REGEX.test(messageText)) {
    try {
      // Additional validation for date validity
      const [day, month, year] = messageText.split("/").map(Number);
      const inputDate = new Date(year, month - 1, day);
      inputDate.setHours(0, 0, 0, 0); // Reset time part to ensure clean date comparison

      // Check if date is valid and not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time part for today's date

      const isValidDate =
        inputDate.getFullYear() === year &&
        inputDate.getMonth() === month - 1 &&
        inputDate.getDate() === day &&
        inputDate >= today;

      if (isValidDate) {
        console.log("Date Validation Result:", {
          input: messageText,
          isValid: true,
          formattedDate: messageText,
        });

        // Get or create user context
        const userContext = userContexts.get(phone) || {};

        // Handle different stages
        switch (userContext.stage) {
          case "EXPECTING_START_DATE":
            const formattedDate = `${today
          .getDate()
          .toString()
          .padStart(2, "0")}/${(today.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${today.getFullYear()}`;

            userContext.insuranceStartDate = messageText; //inputDate;
            userContext.stage = "EXPECTING_END_DATE";
            userContexts.set(phone, userContext);
            await endDate(phone, phoneNumberId);
            break;

          case "EXPECTING_END_DATE":
            //const startDate = new Date(userContext.insuranceStartDate);
            const startDate = new Date(
              userContext.insuranceStartDate.split("/").reverse().join("-")
            );
            startDate.setHours(0, 0, 0, 0); // Reset time part for start date

            // Debug logging
            console.log("Date comparison:", {
              startDate: startDate.toISOString(),
              inputDate: inputDate.toISOString(),
              comparison: inputDate > startDate
            });

            // Check if end date is after start date
            if (inputDate <= startDate) {
              await sendWhatsAppMessage(phone, {
                type: "text",
                text: {
                  body: "End date must be after the start date. Please enter a valid end date with format DD/MM/YYYY e.g: 15/12/2100",
                }
              }, phoneNumberId);
              return;
            }

            userContext.insuranceEndDate =  messageText; //inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          case "CUSTOM_DATE_INPUT":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          default:
            console.log("Unexpected stage for date input:", userContext.stage);
            break;
        }

      } else {
        // Send error message for invalid date
        const errorPayload = {
          type: "text",
          text: {
            body: "Invalid date. Please enter a valid future date in DD/MM/YYYY format. For example: 15/12/2100",
          },
        };
        await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
      }
    } catch (error) {
      console.error("Date validation error:", error);
      const errorPayload = {
        type: "text",
        text: {
          body: "There was an error processing the date. Please try again with a valid date in DD/MM/YYYY format.",
        },
      };
      await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
    }
  }
};

const handleDateValidationOld = async (message, phone, phoneNumberId) => {
  const DATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  const messageText = message.text.body.trim();

  // Validate date format
  if (DATE_REGEX.test(messageText)) {
    try {
      // Additional validation for date validity
      const [day, month, year] = messageText.split("/").map(Number);
      const inputDate = new Date(year, month - 1, day);

      // Check if date is valid and not in the past
      const isValidDate =
        inputDate.getFullYear() === year &&
        inputDate.getMonth() === month - 1 &&
        inputDate.getDate() === day &&
        inputDate >= new Date(); // Ensures date is not in the past

      if (isValidDate) {
        console.log("Date Validation Result:", {
          input: messageText,
          isValid: true,
          formattedDate: messageText,
        });

        // Store the insurance start date in userContext
        const userContext = userContexts.get(phone) || {};
        userContext.insuranceStartDate = inputDate;
        userContexts.set(phone, userContext);

        // Handle different stages
        switch (userContext.stage) {
          case "EXPECTING_START_DATE":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_END_DATE";
            userContexts.set(phone, userContext);
            await endDate(phone, phoneNumberId);
            break;

          case "EXPECTING_END_DATE":
            const startDate = userContext.insuranceStartDate;
            // Check if end date is after start date
          if (inputDate <= startDate) {
            await sendWhatsAppMessage(phone, {
              type: "text",
              text: {
                body: "End date must be after the start date. Please enter a valid end date with format DD/MM/YYYY e.g: 15/12/2100",
              }
            }, phoneNumberId);
            return;
          }

            userContext.insuranceEndDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          case "CUSTOM_DATE_INPUT":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            break;

          default:
            console.log("Unexpected stage for date input:", userContext.stage);
            break;
        }

        // Proceed to next step: selecting insurance cover type
        //await selectInsuranceCoverType(phone, phoneNumberId);
      } else {
        // Send error message for invalid date
        const errorPayload = {
          type: "text",
          text: {
            body: "Invalid date. Please enter a valid future date in DD/MM/YYYY format. For example: 15/12/2100",
          },
        };
        await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
      }
    } catch (error) {
      console.error("Date validation error:", error);
      const errorPayload = {
        type: "text",
        text: {
          body: "There was an error processing the date. Please try again with a valid date in DD/MM/YYYY format.",
        },
      };
      await sendWhatsAppMessage(phone, errorPayload, phoneNumberId);
    }
  }
};

// New comprehensive message handling functions
const handleNFMReply = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  try {
    // Safely parse the flow response
    const flowResponse = message.interactive.nfm_reply.response_json;
    const userResponse = JSON.parse(flowResponse);

    // Use optional chaining and provide a default empty array
    const selectedCoverTypes = userResponse.screen_0_question3Checkbox_0 || [];

    // Validate input
    if (!Array.isArray(selectedCoverTypes)) {
      console.warn(
        `Invalid cover types for phone ${phone}:`,
        selectedCoverTypes
      );
      return;
    }

    console.log("User selected cover types:", selectedCoverTypes);

    // Process specific cover type
    if (selectedCoverTypes.includes("0_Third-Party_Cover_")) {
      userContext.thirdPartyComesaCost = 14000;
      userContext.coverType = 'Rwanda'; 
      await selectToAddPersonalAccidentCover(phone, phoneNumberId);
    }

    // Process specific cover type
    if (selectedCoverTypes.includes("1_COMESA_Cover")) {
      userContext.thirdPartyComesaCost = 10000;
      userContext.coverType = 'COMESA'; 
      await selectToAddPersonalAccidentCover(phone, phoneNumberId);
    }

    // Update user context
    //const userContext = userContexts.get(phone) || {};
    userContext.selectedCoverTypes = selectedCoverTypes;
    userContexts.set(phone, userContext);
  } catch (error) {
    console.error(`Error processing NFM reply for phone ${phone}:`, error);
    // Optionally, you might want to handle the error more gracefully
    // For example, send an error message back to the user
  }
};

const handlePaymentTermsReply = async (
  replyId,
  phone,
  userContext,
  phoneNumberId
) => {
  switch (replyId) {
    case "quantity_1":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "500kg";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_2":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "1Ton";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_3":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "2Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_4":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "4Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_5":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.quantity = "5Tons";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "quantity_more":
      if (userContext.stage === "EXPECTING_QUANTITY_GOODS") {
        await sendAdditionalQuantityMessage(phone, phoneNumberId);
        return;
      }

      break;
    case "seats_1":
      //if (userContext.stage === "EXPECTING_SEATS") {
      await sendAvailableDriversMessage(phone, phoneNumberId);
      userContext.seats = "1";
      userContexts.set(phone, userContext);
      //  return;
      // }

      break;
    case "seats_2":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "2";
        userContexts.set(phone, userContext);
        return;
      }

      break;

    case "seats_3":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "3";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_4":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "4";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_5":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "5";
        userContexts.set(phone, userContext);
        return;
      }

      break;
    case "seats_more":
      if (userContext.stage === "EXPECTING_SEATS") {
        await sendAdditionalSeatsMessage(phone, phoneNumberId);
        return;
      }

      break;
    case "pickup_later":
      if (userContext.stage === "EXPECTING_NOW_LATER") {
        await sendCustomPickupTimeMessage(phone, phoneNumberId);
        return;
      } else if (userContext.stage === "EXPECTING_NOW_LATER_GOODS") {
        await sendCustomPickupTimeMessageGoods(phone, phoneNumberId);
        return;
      } else {
        console.log("Not the right button");
      }

      break;
    case "pickup_now":
      if (userContext.stage === "EXPECTING_NOW_LATER") {
        await sendSeatSelectionMessage(phone, phoneNumberId);
        return;
      } else if (userContext.stage === "EXPECTING_NOW_LATER_GOODS") {
        await sendQuantitySelectionMessage(phone, phoneNumberId);
        return;
      } else {
        console.log("Not the right button");
      }

      break;
    case "less_than_a_year":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await startDate(phone, phoneNumberId);
        return;
      }

      break;
    case "full_year":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await selectInsurancePeriod(
          phone,
          userContext.formattedPlate,
          phoneNumberId
        );
        return;
      }

      break;

    case "add_yes":
      if (userContext.stage === "PERSONAL_ACCIDENT_COVER") {
        await selectPersonalAccidentCategory(phone, phoneNumberId);
        console.log("Expecting CAT1.../FULL PAYMENT button reply");
        return;
      }

      break;
    case "add_no":
      // Calculate total cost
      //const coverageCost = userContext.selectedCoverage || 0;
      userContext.selectedCoverage = 0; // Price for CAT 0 None
      const coverageCost = userContext.thirdPartyComesaCost;
      userContext.totalCost = 1 * coverageCost;

      userContext.stage = null;
      //userContext.numberOfCoveredPeople = 1;
      userContexts.set(phone, userContext);

      await selectPaymentPlan(phone, phoneNumberId);
      break;
    case "agree_to_terms":
      console.log("User agreed to the terms. Proceeding with payment.");
      await processPayment(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "cancel_payment":
      console.log("User canceled the payment.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Payment has been canceled. Let us know if you need anything else!",
          },
        },
        phoneNumberId
      );
      break;
    case "start_today":
      if (userContext.stage === "EXPECTING_INSURANCE_PERIOD") {
        // Store the insurance start date in userContext
        const today = new Date();
        const formattedDate = `${today
          .getDate()
          .toString()
          .padStart(2, "0")}/${(today.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${today.getFullYear()}`;

        // Calculate the insurance end date by adding one year
    const insuranceEndDate = new Date(today);
    insuranceEndDate.setFullYear(insuranceEndDate.getFullYear() + 1);
    const formattedEndDate = `${insuranceEndDate
      .getDate()
      .toString()
      .padStart(2, "0")}/${(insuranceEndDate.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${insuranceEndDate.getFullYear()}`;
        
    userContext.insuranceEndDate = formattedEndDate;
        userContext.insuranceStartDate = formattedDate;
        userContexts.set(phone, userContext);
        await selectInsuranceCoverType(phone, phoneNumberId);
        console.log("Expecting start_today button reply");
        return;
      }

      break;

    case "custom_date":
      if (userContext.stage === "EXPECTING_INSURANCE_PERIOD") {
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "Please enter your desired start date (DD/MM/YYYY, 02/01/2025):",
            },
          },
          phoneNumberId
        );
        userContext.stage = "CUSTOM_DATE_INPUT";
        userContexts.set(phone, userContext);
        console.log("Expecting custom_date button reply");
        return;
      }

      break;

    default:
      console.log("Unknown payment response:", replyId);
  }
};

const handleNumberOfPeople = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  if (userContext.stage === "EXPECTING_NUMBER_OF_PEOPLE") {
    const messageText = message.text.body.trim();
    const numberOfPeople = parseInt(messageText);

    if (
      !isNaN(numberOfPeople) &&
      numberOfPeople > 0 &&
      numberOfPeople <= 1000
    ) {
      try {
        console.log("Number of Covered People Validation Result:", {
          input: messageText,
          isValid: true,
          numberOfPeople: numberOfPeople,
        });

        // Calculate total cost
        const coverageCost = userContext.selectedCoverage || 0;
        userContext.totalCost = numberOfPeople * coverageCost;

        userContext.stage = null;
        userContext.numberOfCoveredPeople = numberOfPeople;
        userContexts.set(phone, userContext);

        await selectVehicleBodyType(phone, phoneNumberId); //await selectPaymentPlan(phone, phoneNumberId);
      } catch (error) {
        console.error("Processing error:", error);
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "An error occurred. Please try again.",
            },
          },
          phoneNumberId
        );
      }
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid input. Please enter a number between 1 and 1000. For example: 3",
          },
        },
        phoneNumberId
      );
    }
  }
};


// Updated handleTextMessages function
const handleTextMessages = async (message, phone, phoneNumberId) => {
  let userContext = userContexts.get(phone) || {};

  // Handle table selection stage
  if (userContext.stage === "TABLE_SELECTION") {
    const table = message.text.body.trim();
    userContext.table = table;
    await sendOrderSummary(phone, phoneNumberId);
    userContexts.set(phone, userContext);
    return;
  }

  const messageText = message.text.body.trim().toLowerCase();
  
  // Check if we have a handler for this message
  const handler = textMessageCases.get(messageText);
  
  if (handler) {
    if (typeof handler === 'function') {
      // Execute function handler
      await handler(userContext, phone, phoneNumberId);
    } else if (handler.vendorId) {
      // Handle menu/vendor selection
      await sendClassSelectionMessage(phone, phoneNumberId);
      userContext.vendorId = handler.vendorId;
      userContext.stage = "CLASS_SELECTION";
      userContexts.set(phone, userContext);
    }
  } else {
    console.log(`Received unrecognized text message: ${messageText}`);
  }
};

const handleTextMessagesOld = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};
  const messageText = message.text.body.trim().toLowerCase();
  
  // Handle table selection stage
  if (userContext.stage === "TABLE_SELECTION") {
    const table = message.text.body.trim();
    userContext.table = table;
    await sendOrderSummary(phone, phoneNumberId);
    userContexts.set(phone, userContext);
    return;
  }

  //const messageText = message.text.body.trim().toLowerCase();
  
  // Check if we have a handler for this message
  const handler = textMessageCases.get(messageText);
  
  if (handler) {
    if (typeof handler === 'function') {
      // Execute function handler
      await handler(userContext, phone, phoneNumberId);
    } else if (handler.vendorId) {
      // Handle menu/vendor selection
      await sendClassSelectionMessage(phone, phoneNumberId);
      userContext.vendorId = handler.vendorId;
      userContext.stage = "CLASS_SELECTION";
      userContexts.set(phone, userContext);
    }
  } else {
    console.log(`Received unrecognized text message: ${messageText}`);
  }
  

  switch (messageText) {
    case "adminclear":
      userContexts.clear();
      console.log("All user contexts reset.");
      break;

    case "clear":
      userContexts.delete(phone);
      console.log("User context reset.");
      break;

    case "insurance":
      console.log("User requested insurance options.");
      await sendWelcomeMessage(phone, phoneNumberId);
      break;
    case "lifuti":
      console.log("User requested insurance options.");
      await sendLifutiWelcomeMessage(phone, phoneNumberId);
      break;

    default:
      console.log(`Received unrecognized message: ${messageText}`);
  }
};



const handleInteractiveMessages = async (message, phone, phoneNumberId) => {
  const interactiveType = message.interactive.type;
  const replyId =
    interactiveType === "list_reply"
      ? message.interactive.list_reply.id
      : message.interactive.button_reply.id;

  const userContext = userContexts.get(phone) || {};

  switch (replyId) {
    case "passenger":
      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your pick up address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      userContext.serviceType = "passengers";
      userContext.stage = "EXPECTING_PICKUP_ADDRESS";
      userContexts.set(phone, userContext);
      break;

    case "goods":
      // Send location request message
      const locationRequestPayloadGoods = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your pick up address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(
        phone,
        locationRequestPayloadGoods,
        phoneNumberId
      );

      userContext.serviceType = "goods";
      userContext.stage = "EXPECTING_PICKUP_ADDRESS_GOODS";
      userContexts.set(phone, userContext);
      break;

    case "get_insurance":
      await requestInsuranceDocument(phone, phoneNumberId);
      break;

    case "file_claim":
      await initiateClaimProcess(phone, phoneNumberId);
      break;


    case "side_cars_motor_bikes":
      userContext.bodyType = "Side Cars & Motor Bikes, Tricycles"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "car_voiture":
      userContext.bodyType = "Car/Voiture"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "jeep_suv":
      userContext.bodyType = "Jeep/SUV"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "pickup":
      userContext.bodyType = "Pickup_Camionnenette (small lorry (< 5 tonnes))"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "minibus_van":
      userContext.bodyType = "Minibus/Van"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "school_bus":
      userContext.bodyType = "School bus"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "bus":
      userContext.bodyType = "Bus"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;
      
    case "trailer_semi_trailer":
      userContext.bodyType = "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "howo_shacman_fuso_faw":
      userContext.bodyType = "HOWO, SHACMAN, FUSO, FAW"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "truck_tractor_lorry":
      userContext.bodyType = "Truck (Camion) & Tractor, Lorry>= 5 tonnes – Camionnette"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;
      
    case "cat_1":
      userContext.selectedCoverage = 1000000; // Price for CAT 1
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_2":
      userContext.selectedCoverage = 2000000; // Price for CAT 2
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_3":
      userContext.selectedCoverage = 3000000; // Price for CAT 3
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_4":
      userContext.selectedCoverage = 4000000; // Price for CAT 4
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "cat_5":
      userContext.selectedCoverage = 5000000; // Price for CAT 5
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "risk_taker":
      userContext.selectedCoverage = 0; // No cost for no coverage
      userContexts.set(phone, userContext);
      await numberOfCoveredPeople(phone, phoneNumberId);
      break;

    case "installment_cat1":
      userContext.selectedInstallment = "i_cat1";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat2":
      userContext.selectedInstallment = "i_cat2";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat3":
      userContext.selectedInstallment = "i_cat3";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat4":
      userContext.selectedInstallment = "i_cat4";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "full_payment":
      userContext.selectedInstallment = "i_catf";
      userContexts.set(phone, userContext);
      await confirmAndPay(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    default:
      console.log("Unrecognized reply ID:", replyId);
  }
};

// --- 7. Handling Interactive Replies ---
// Process interactive replies based on the current stage stored in the user context.
async function handleSecondInteractiveMessages(message, phone, phoneNumberId) {
  let userContext = userContexts.get(phone) || {};

  switch (userContext.stage) {
    case "CLASS_SELECTION":
      if (message.interactive?.button_reply) {
        const classId = message.interactive.button_reply.id; // "CLASS_FOOD" or "CLASS_DRINKS"
        const selectedClass = classId === "CLASS_FOOD" ? "Food" : "Drinks";
        userContext.selectedClass = selectedClass;
        
        await sendCategorySelectionMessage(phone, phoneNumberId, userContext.selectedClass);
        userContext.stage = "CATEGORY_SELECTION";
        userContexts.set(phone, userContext);
      }
      break;

    case "CATEGORY_SELECTION":
      if (message.interactive?.list_reply) {
        const categoryId = message.interactive.list_reply.id;
        if (categoryId === "MORE_ITEMS") {
          // Pagination for categories
          userContext.page = (userContext.page || 0) + 1;
          userContexts.set(phone, userContext);
          await sendCategorySelectionMessage(phone, phoneNumberId, userContext.selectedClass);
        } else {
          userContext.selectedCategory = categoryId;
          userContext.stage = "PRODUCT_SELECTION";
          userContext.page = 0; // Reset pagination for product selection
          userContexts.set(phone, userContext);
          await sendProductSelectionMessage(
            phone,
            phoneNumberId,
            userContext.selectedClass,
            categoryId
          );
        }
      }
      break;

    case "PRODUCT_SELECTION":
  if (message.interactive?.list_reply) {
    const selectedId = message.interactive.list_reply.id;
    const selectedTitle = message.interactive.list_reply.title; // Get the product name
    // Look up the price from the stored productData mapping.
    const productData = userContext.productData || {};
    const selectedPrice = productData[selectedId] ? productData[selectedId].price : "0";

    if (selectedId === "MORE_ITEMS") {
      // Pagination for products
      userContext.page = (userContext.page || 0) + 1;
      userContexts.set(phone, userContext);
      await sendProductSelectionMessage(
        phone,
        phoneNumberId,
        userContext.selectedClass,
        userContext.selectedCategory
      );
    } else {
      // Normal product selection: save product data (id and name)
      if (!userContext.order) userContext.order = [];
      //userContext.order.push({ id: selectedId, name: selectedTitle });
      userContext.order.push({ id: selectedId, name: selectedTitle, price: selectedPrice });
      userContext.stage = "ORDER_PROMPT";
      userContext.page = 0; // Reset page for later selections if needed
      userContexts.set(phone, userContext);
      await sendOrderPrompt(phone, phoneNumberId);
    }
  }
  break;


    case "ORDER_PROMPT":
      if (message.interactive?.button_reply) {
        const buttonId = message.interactive.button_reply.id;
        if (buttonId === "MORE") {
          userContext.stage = "PRODUCT_SELECTION";
          userContexts.set(phone, userContext);
          await sendClassSelectionMessage(phone, phoneNumberId); 
         // await sendProductSelectionMessage(
         //   phone,
         //   phoneNumberId,
         //   userContext.selectedClass,
         //   userContext.selectedCategory
         // );
        } else if (buttonId === "ORDER") {
          //await sendOrderSummary(phone, phoneNumberId);
          await sendTable(phone, phoneNumberId);
        }
      }
      break;
    case "PAY_PROMPT":
      if (message.interactive?.button_reply) {
        const buttonId = message.interactive.button_reply.id;
        if (buttonId === "PAY") {
          userContext.stage = "PAYMENT_INFO";
          userContexts.set(phone, userContext);
          await sendPaymentInfo(phone, phoneNumberId); 
         
        } else if (buttonId === "ADD_MORE") {
          userContext.stage = "CLASS_SELECTION";
          userContexts.set(phone, userContext);
          await sendClassSelectionMessage(phone, phoneNumberId); 
         
        } else if (buttonId === "CANCEL") {
          await userContexts.delete(phone);
        }
      }
      break;

    default:
      console.log("Unhandled stage in interactive message:", userContext.stage);
  }
}

// handle document upload
const handleDocumentUpload = async (message, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};

  // Validate phoneNumberId early
  if (!phoneNumberId) {
    console.error("Missing phoneNumberId in handleDocumentUpload");
    return;
  }

  // Only process if expecting a document
  if (userContext.stage !== "EXPECTING_DOCUMENT") {
    console.log("Not expecting a document at this stage");
    return;
  }

  const mediaId = message.document?.id || message.image?.id;
  const mediaMimeType = message.document?.mime_type || message.image?.mime_type;

  // Validate file type
  if (
    !mediaId ||
    !(mediaMimeType === "application/pdf" || mediaMimeType.startsWith("image/"))
  ) {
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Invalid file type. Please upload a clear image or PDF of your insurance certificate.",
        },
      },
      phoneNumberId
    );
    return;
  }

  try {
    console.log("Received a document:", mediaId);

    // 1. Get the media URL from WhatsApp
    const mediaUrl = await getMediaUrl(mediaId);
    if (!mediaUrl) {
      throw new Error("Failed to get media URL from WhatsApp");
    }

    // 2. Download the media file with proper headers
    const fileBuffer = await axios
      .get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      })
      .then((res) => Buffer.from(res.data, "binary"));

    const fileExtension = getFileExtension(mediaMimeType);
    const fileName = `insurance_documents/${phone}_${Date.now()}${fileExtension}`;

    // 3. Upload the file to Firebase Storage
    const file = bucket.file(fileName);
    await file.save(fileBuffer, {
      metadata: { contentType: mediaMimeType },
    });

    // 4. Get the public URL of the uploaded file
    const [publicUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-09-2491", // Far future date
    });

    // 5. Save the storage URL to Firestore
    const today = new Date();
    const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(
      today.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${today.getFullYear()}`;

    const insuranceData = {
      userPhone: phone,
      insuranceDocumentUrl: publicUrl, // Store the storage URL
      creationDate: formattedDate,
      plateNumber: "", // Will be filled later
      insuranceStartDate: "", // Will be filled later
      selectedCoverTypes: "",
      numberOfCoveredPeople: 0,
      selectedPersonalAccidentCoverage: 0,
      totalCost: 0,
      selectedInstallment: "",
    };

    // 6. Save to Firestore
    try {
      const docRef = await firestore3
        .collection("whatsappInsuranceOrders")
        .add(insuranceData);
      console.log("Document reference saved to Firestore");
      userContext.insuranceDocId = docRef.id;
    } catch (firestoreError) {
      console.error("Firestore save error:", firestoreError);
      throw new Error("Failed to save document reference");
    }

    // 7. Update user context
    userContext.insuranceDocumentId = publicUrl; // Update with storage URL
    userContext.stage = null;
    userContexts.set(phone, userContext);

    let validDocument = false;
    // 8. Make POST request to extract data endpoint
    try {
      const extractionResponse = await axios.post(
        "https://assigurwmessaging-1u57.onrender.com/extract-data",
        {
          imageUrl: publicUrl, // Use the storage URL for extraction
        }
      );
      console.log("Data extraction response:", extractionResponse.data);
      if (extractionResponse.data.success) {
        // Parse the raw response by removing the code block markers and parsing the JSON

        //const rawResponse = extractionResponse.data.data.raw_response;
        //const jsonString = rawResponse.replace(/```json\n|\n```/g, '').trim();
        //const extractedData = JSON.parse(jsonString);

        const rawResponse = extractionResponse.data.data.raw_response;
        console.log("Raw response before parsing:", rawResponse);

        let extractedData;
        try {
          const jsonString = rawResponse.replace(/```json\n|\n```/g, "").trim();
          console.log("Cleaned JSON string:", jsonString);
          extractedData = JSON.parse(jsonString);
        } catch (parseError) {
          console.error("JSON parsing error:", parseError);
          // Send message to user about invalid document
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "The uploaded document appears to be invalid. Please ensure it's a valid insurance certificate containing policyholder name, chassis number, and insurer details. Please upload a valid document.",
              },
            },
            phoneNumberId
          );
          userContext.stage = "EXPECTING_DOCUMENT";
          userContexts.set(phone, userContext);
          return;
        }

        // Now extractedData is a proper JavaScript object
        const {
          policyholder_name: policyholderName = "",
          policy_no: policyNo = "",
          inception_date: insuranceStartDate = "",
          expiry_date: expiryDate = "",
          mark_and_type: markAndType = "",
          registration_plate_no: plateNumber = "",
          chassis = "",
          licensed_to_carry_no: licensedToCarryNo = "",
          usage = "",
          insurer = "",
        } = extractedData;

        // Check for required fields
        if (
          !policyholderName ||
          policyholderName === "" ||
          !chassis ||
          chassis === "" ||
          !insurer ||
          insurer === ""
        ) {
          // Send error message to user
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "The uploaded document appears to be invalid. Please ensure it's a valid insurance certificate containing policyholder name, chassis number, and insurer details. Please upload a valid document.",
              },
            },
            phoneNumberId
          );

          // Update context to expect another document
          userContext.stage = "EXPECTING_DOCUMENT";
          userContexts.set(phone, userContext);
          return;
        }

        validDocument = true;

        // Save the extracted data to Firestore
        await firestore3
          .collection("whatsappInsuranceOrders")
          .doc(userContext.insuranceDocId)
          .update({
            insuranceStartDate,
            plateNumber,
            policyholderName,
            policyNo,
            expiryDate,
            markAndType,
            chassis,
            licensedToCarryNo,
            usage,
            insurer,
          });

        userContext.formattedPlate = plateNumber; // Update with storage URL
        userContext.licensedToCarryNumber = licensedToCarryNo;
        userContext.markAndTypeValue = markAndType;
        userContexts.set(phone, userContext);
      } else {
        console.error("Data extraction failed:", extractionResponse.data);
      }
    } catch (extractionError) {
      console.error("Data extraction error:", extractionError);
      // Continue with the flow even if extraction fails
    }

    // 9. Proceed to next step regardless of extraction result
    //await requestVehiclePlateNumber(phone, phoneNumberId);
    //await selectInsurancePeriod(phone, userContext.formattedPlate, phoneNumberId);
    // Only proceed to next step if document is valid
    if (validDocument) {
      await stateInsuranceDuration(
        phone,
        userContext.formattedPlate,
        phoneNumberId
      );
    }
    //await stateInsuranceDuration(phone, userContext.formattedPlate, phoneNumberId);
  } catch (error) {
    console.error("Error processing document:", error);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "An error occurred while processing your document. Please try again.",
        },
      },
      phoneNumberId
    );
  }
};

// Helper function to get media URL from WhatsApp
async function getMediaUrl(mediaId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    return response.data.url;
  } catch (error) {
    console.error("Error getting media URL:", error);
    return null;
  }
}

// Helper function to get file extension from MIME type
function getFileExtension(mimeType) {
  const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
  };
  return extensions[mimeType] || "";
}

async function getBase64FromUrl(url) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(response.data, "binary");
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function extractImageData(imageUrl) {
  try {
    const base64Image = await getBase64FromUrl(imageUrl);

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the following details, policyholder name, policy no, inception date, expiry date, mark & type, registation plate no, chassis, licensed to carry no, usage, insurer. Return these details in JSON format.",
              },
              {
                type: "image_url",
                image_url: {
                  url: base64Image,
                },
              },
            ],
          },
        ],
        max_tokens: 150,
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.choices && response.data.choices[0]) {
      const content = response.data.choices[0].message.content;
      // Return the raw response content without parsing
      return {
        raw_response: content,
      };
    }

    throw new Error("No valid response from API");
  } catch (error) {
    console.error(
      "Error during extraction:",
      error.response?.data || error.message
    );
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

app.post("/extract-data", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    const extractedData = await extractImageData(imageUrl);
    console.log("Extracted data:", extractedData);
    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to extract data",
    });
  }
});

const handleLocation = async (location, phone, phoneNumberId) => {
  const userContext = userContexts.get(phone) || {};
  try {
    if (userContext.stage === "EXPECTING_PICKUP_ADDRESS") {
      // Retrieve the order from userContext
      const userContext = userContexts.get(phone) || {};

      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;
      userContext.pickupAddress = location.address || "";

      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your drop off address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      // Update user context to expect TIN input
      //userContext.vendorNumber = vendorNumber;
      //userContext.currency = currentCurrency;
      userContext.stage = "EXPECTING_DROPOFF_ADDRESS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_DROPOFF_ADDRESS") {
      // Send location request message

      userContext.dropoffAddress = location.address || "";
      userContext.dropoffLatitude = location.latitude;
      userContext.dropoffLongitude = location.longitude;

      const requestTimePayload = {
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "When do you want to be picked up?",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "pickup_now",
                  title: "Now",
                },
              },
              // {
              // type: "reply",
              // reply: {
              //   id: "pickup_later",
              //    title: "Later",
              //   },
              //  },
            ],
          },
        },
      };

      await sendWhatsAppMessage(phone, requestTimePayload, phoneNumberId);

      userContext.stage = "EXPECTING_NOW_LATER";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_PICKUP_ADDRESS_GOODS") {
      // Retrieve the order from userContext
      const userContext = userContexts.get(phone) || {};

      userContext.pickupAddress = location.address || "";
      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;

      // Send location request message
      const locationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your drop off address",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      userContext.stage = "EXPECTING_DROPOFF_ADDRESS_GOODS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_DROPOFF_ADDRESS_GOODS") {
      // Send location request message
      const userContext = userContexts.get(phone) || {};

      userContext.dropoffAddress = location.address || "";
      userContext.dropoffLatitude = location.latitude;
      userContext.dropoffLongitude = location.longitude;

      const requestTimePayload = {
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: "When do you want to be picked up?",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "pickup_now",
                  title: "Now",
                },
              },
           //   {
           //     type: "reply",
           //     reply: {
           //       id: "pickup_later",
           //       title: "Later",
           //     },
           //   },
            ],
          },
        },
      };

      await sendWhatsAppMessage(phone, requestTimePayload, phoneNumberId);

      userContext.stage = "EXPECTING_NOW_LATER_GOODS";
      userContexts.set(phone, userContext);
    } else {
      console.log("Not the correct stage");
    }

    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error.message);
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location: ${error.message}. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};

// Add this function to handle driver selection
async function handleDriverSelection(message, phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  if (
    userContext.stage === "DISPLAYING_DRIVERS" &&
    message.interactive?.type === "list_reply"
  ) {
    const selectedDriverId = message.interactive.list_reply.id;

    // Find the selected driver from stored context
    const selectedDriver = userContext.availableDrivers.find(
      (driver) => driver.id === selectedDriverId
    );

    if (selectedDriver && userContext.rideRequestId) {
      // Update the ride request with selected driver info
      await firestore
        .collection("whatsappRides")    //whatsappRides requestRiders
        .doc(userContext.rideRequestId)
        .update({
          rider: selectedDriver.driverId,
          offerpool: selectedDriver.id,
          price: selectedDriver.price,
        });

      // Send confirmation message to user
      const confirmationPayload = {
        type: "text",
        text: {
          body: `*Your ride has been booked!*\n\nDriver Details:\nVehicle: ${selectedDriver.vehicle}\nPlate Number: ${selectedDriver.plateno}\nPrice: RWF${selectedDriver.price}\nDriver's WhatsApp Phone No: ${selectedDriver.user}\n\nYour driver will contact you shortly.`,
        },
      };

      await sendWhatsAppMessage(phone, confirmationPayload, phoneNumberId);

      // Update user context
      userContext.stage = "RIDE_BOOKED";
      userContexts.set(phone, userContext);
    }
  }
}

const processedMessages = new Set();

// Webhook endpoint for receiving messages
app.post("/webhook", async (req, res) => {
  if (req.body.object === "whatsapp_business_account") {
    const changes = req.body.entry?.[0]?.changes?.[0];
    const messages = changes.value?.messages;
    const phoneNumberId = changes.value?.metadata?.phone_number_id;

    if (!changes || !messages || !phoneNumberId) {
      return res.status(400).send("Invalid payload.");
    }

    // Only process the first message in the array
    const message = messages[0];
    const phone = message.from;
    const uniqueMessageId = `${phoneNumberId}-${message.id}`;

    if (processedMessages.has(uniqueMessageId)) {
      console.log("Duplicate message ignored:", uniqueMessageId);
      return res.sendStatus(200);
    }

    processedMessages.add(uniqueMessageId);
    

    try {
      if (phoneNumberId === "561637583695258") {
        await handlePhoneNumber1Logic(message, phone, changes, phoneNumberId);
      } else {
        console.warn("Unknown phone number ID:", phoneNumberId);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    } finally {
      setTimeout(() => processedMessages.delete(uniqueMessageId), 300000);
    }
  }

  res.sendStatus(200);
});

async function handlePhoneNumber1Logic(message, phone, changes, phoneNumberId) {
  switch (message.type) {
    case "text":
      await handleTextMessages(message, phone, phoneNumberId);
      await handlePlateNumberValidation(message, phone, phoneNumberId);
      await handleDateValidation(message, phone, phoneNumberId);
      await handleNumberOfPeople(message, phone, phoneNumberId);
      await handleTimeValidation(message, phone, phoneNumberId);
      const userContext = userContexts.get(phone) || {};
      if (userContext.stage === "EXPECTING_TIN") {
        const tin = message.text.body.trim();
        if (tin) {
          console.log(`User ${phone} provided TIN: ${tin}`);
          // Store the TIN or process it as required
          // Update the context to expect the location
          //userContext.tin = tin;  // Save the TIN
          userContext.stage = "EXPECTING_MTN_AIRTEL"; // Move to location stage
          userContexts.set(phone, userContext);

          await sendWhatsAppMessage(
            phone,
            {
              type: "interactive",
              interactive: {
                type: "button",
                body: {
                  text: "Proceed to payment",
                },
                action: {
                  buttons: [
                    {
                      type: "reply",
                      reply: { id: "mtn_momo", title: "MTN MoMo" },
                    },
                    {
                      type: "reply",
                      reply: {
                        id: "airtel_mobile_money",
                        title: "Airtel Money",
                      },
                    },
                  ],
                },
              },
            },
            phoneNumberId
          );

          return; // Exit early after processing TIN
        } else {
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: "Invalid TIN. Please provide a valid TIN.",
              },
            },
            phoneNumberId
          );
          return;
        }
      }
      break;

    case "interactive":
      if (message.interactive.type === "nfm_reply") {
        await handleNFMReply(message, phone, phoneNumberId);
      } else if (message.interactive.type === "button_reply") {
        const buttonId = message.interactive.button_reply.id;

        // Only process if MENU pay
        const userContext = userContexts.get(phone) || {};

        
        await handleSecondInteractiveMessages(message, phone, phoneNumberId);
        
        await handlePaymentTermsReply(
          buttonId,
          phone,
          userContexts.get(phone),
          phoneNumberId
        );
        console.log("Expecting AGREE & PAY button reply");
        return;
      } else {
        await handleInteractiveMessages(message, phone, phoneNumberId);
        await handleSecondInteractiveMessages(message, phone, phoneNumberId);
        await handleDriverSelection(message, phone, phoneNumberId);
      }
      break;


    case "document":
    case "image":
      await handleDocumentUpload(message, phone, phoneNumberId);
      break;

    case "location":
      await handleLocation(message.location, phone, phoneNumberId);
      break;

    default:
      console.log("Unrecognized message type:", message.type);
  }
}

//if (phoneNumberId === "396791596844039") { 189923527537354
// Webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "icupatoken31";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified successfully!");
      res.status(200).send(challenge);
    } else {
      res.status(403).send("Verification failed!");
    }
  }
});

// Function to format phone number
const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
};

// Function to test WhatsApp connection
async function testWhatsAppConnection() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${VERSION}/me`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }
    );
    console.log("WhatsApp connection test successful:", response.data);
    return true;
  } catch (error) {
    console.error(
      "WhatsApp connection test failed:",
      error.response?.data || error.message
    );
    return false;
  }
}

// Unified message sending function
async function sendWhatsAppMessage(phone, messagePayload, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formatPhoneNumber(phone),
        ...messagePayload,
      },
    });

    console.log(
      `Message sent successfully from ${phoneNumberId}:`,
      response.data
    );
    return response.data;
  } catch (error) {
    console.error(
      `WhatsApp message sending error from ${phoneNumberId}:`,
      error.response?.data || error.message
    );
    throw error;
  }
}

// Lifuti
// Initial welcome message
async function sendLifutiWelcomeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_LIFUTI_WELCOME"; // Stage set to "WELCOME"
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Welcome to Lifuti\nRide Sharing Services!",
      },
      body: {
        text: "What would you like to do today?",
      },
      footer: {
        text: "Select an action to proceed",
      },
      action: {
        button: "View Options",
        sections: [
          {
            title: "Lifuti Services",
            rows: [
              {
                id: "passenger",
                title: "Get a ride",
                description: "Passenger(Taxi/Cab)",
              },
              {
                id: "goods",
                title: "Goods(Transportation)",
                description: "Move goods to the location of your choice",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 5: Custom pickup time selection (for "Later" option)
async function sendCustomPickupTimeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_CUSTOM_TIME";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: "Please enter your preferred pickup time in either format:\n12:00PM or 13:00",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 5 Goods: Custom pickup time selection (for "Later" option)
async function sendCustomPickupTimeMessageGoods(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_CUSTOM_TIME_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: "Please enter your preferred pickup time in either format:\n12:00PM or 13:00",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 6: Number of seats selection (for passenger rides)
async function sendSeatSelectionMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_SEATS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Select Number of Seats",
      },
      body: {
        text: "How many seats would you like to book?",
      },
      footer: {
        text: "Maximum 5 seats per booking",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "seats_1", title: "1 Seat" },
          },
          {
            type: "reply",
            reply: { id: "seats_2", title: "2 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_more", title: "More" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Additional seats options (since WhatsApp limits buttons to 3)
async function sendAdditionalSeatsMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_SEATS";
  userContexts.set(phone, userContext);
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "More seats:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "seats_3", title: "3 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_4", title: "4 Seats" },
          },
          {
            type: "reply",
            reply: { id: "seats_5", title: "5 Seats" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 6: Number of quantity selection (for goods rides)
async function sendQuantitySelectionMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_QUANTITY_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Select Number of Quantity",
      },
      body: {
        text: "How much would you like to transport?",
      },
      footer: {
        text: "Maximum 100Tons per booking",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "quantity_1", title: "500 Kg" },
          },
          {
            type: "reply",
            reply: { id: "quantity_2", title: "1 Ton" },
          },
          {
            type: "reply",
            reply: { id: "quantity_more", title: "More" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Additional quantity options (limits buttons to 3)
async function sendAdditionalQuantityMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_QUANTITY_GOODS";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "More Quantities:",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: "quantity_3", title: "2 Tons" },
          },
          {
            type: "reply",
            reply: { id: "quantity_4", title: "3 Tons" },
          },
          {
            type: "reply",
            reply: { id: "quantity_5", title: "4 Tons" },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Step 7: Display available drivers
async function sendAvailableDriversMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "DISPLAYING_DRIVERS";
  userContexts.set(phone, userContext);

  // Prepare data for Firebase
  const rideData = {
    accepted: false,
    cancelled: false,
    completed: false,
    country_code: "RW",
    createdAt: admin.firestore.Timestamp.now(),
    dropoff: false,
    pickup: false,
    paid: false,
    price: 0,
    rejected: false,
    offerpool: "",
    rider: "",
    type: userContext.serviceType || "passengers",
    requestedBy: phone,
    requestedTime: admin.firestore.Timestamp.fromDate(
      userContext.pickupTime ? new Date(userContext.pickupTime) : new Date()
    ),
    pickupLocation: {
      address: userContext.pickupAddress || "",
      latitude: userContext.pickupLatitude || 0,
      longitude: userContext.pickupLongitude || 0,
    },
    dropoffLocation: {
      address: userContext.dropoffAddress || "",
      latitude: userContext.dropoffLatitude || 0,
      longitude: userContext.dropoffLongitude || 0,
    },
    seats:
      userContext.serviceType === "passengers"
        ? parseInt(userContext.seats) || 0
        : null,
    quantity:
      userContext.serviceType === "goods" ? userContext.quantity || null : null,
    measure: null,
  };

  // Save to Firebase
  const docRef = await firestore.collection("whatsappRides").add(rideData);
  console.log("Ride request saved with ID: ", docRef.id);

  // Update user context with Firebase document ID
  userContext.rideRequestId = docRef.id;
  userContexts.set(phone, userContext);

  // Set queryTime to now (i.e., only future or current available drivers)
  const queryTime = admin.firestore.Timestamp.now();

  // Fetch available drivers from offerPool
  let offerPoolQuery = firestore
    .collection("offerPool")
    .where("completed", "==", false)
    .where("type", "==", userContext.serviceType)
    .where("dateTime", ">=", queryTime);

  // Add seats filter for passenger service
  if (userContext.serviceType === "passengers" && userContext.seats) {
    offerPoolQuery = offerPoolQuery.where(
      "emptySeat",
      ">=",
      parseInt(userContext.seats)
    );
  }

  const offerPoolSnapshot = await offerPoolQuery.get();
  const availableDrivers = [];

  // Process each offer and fetch corresponding vehicle details
  for (const doc of offerPoolSnapshot.docs) {
    const offerData = doc.data();

    // Fetch vehicle details for the driver
    const vehicleDoc = await firestore
      .collection("vehicles")
      .where("userId", "==", offerData.user)
      .get();

    if (!vehicleDoc.empty) {
      const vehicleData = vehicleDoc.docs[0].data();

      // Format datetime
      const formattedDateTimeDriver = formatDateTimeDrivers(offerData.dateTime);

      // Calculate distance
      let distance = "N/A";
      if (
        userContext.pickupLatitude && 
        userContext.pickupLongitude && 
        offerData.pickupLocation?.latitude && 
        offerData.pickupLocation?.longitude
      ) {
        distance = calculateDistance(
          userContext.pickupLatitude, 
          userContext.pickupLongitude,
          offerData.pickupLocation.latitude, 
          offerData.pickupLocation.longitude
        );
      }

      availableDrivers.push({
        id: doc.id,
        plateno: vehicleData.vehicleRegNumber,
        vehicle: vehicleData.vehicleMake,
        seats: offerData.selectedSeat,
        driverId: offerData.user,
        price: offerData.pricePerSeat,
        user: offerData.user,
        distance: `${distance} km`,
        dateTime: formattedDateTimeDriver,
      });
    }
  }

  // Store available drivers in user context for later reference
  userContext.availableDrivers = availableDrivers;
  userContexts.set(phone, userContext);

  // Check if no drivers are available
  if (availableDrivers.length === 0) {
    const noDriversPayload = {
      type: "text",
      text: {
        body: `*Oops, no drivers available currently.* \nYour ride has been booked, a driver will call you after accepting the ride.`
      }
    };
    await sendWhatsAppMessage(phone, noDriversPayload, phoneNumberId);
    return;
  }

  // Prepare the WhatsApp message payload
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Available Drivers",
      },
      body: {
        text: `Select a driver to proceed with your ${userContext.serviceType} booking:`,
      },
      footer: {
        text: "Tap to view driver details",
      },
      action: {
        button: "View Drivers",
        sections: [
          {
            title: "Nearby Drivers",
            rows: availableDrivers.map((driver) => ({
              id: driver.id,
              title: `${driver.plateno}`,
              description: `${driver.vehicle} | ${
                userContext.serviceType === "passengers"
                  ? `Seats: ${driver.seats}`
                  : "Goods"
              } | ${driver.price.toLocaleString()} RWF | ${driver.dateTime} | ${driver.distance}`,
            })),
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}


// Helper function to format datetime
function formatDateTimeDrivers(timestamp) {
  if (!timestamp) return "N/A";
  
  // If timestamp is a Firestore Timestamp, convert to Date
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  // Format options
  const options = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Kigali', // Adjust to your specific timezone
  };
  
  // Format the date
  return date.toLocaleString('en-US', options);
}

// Haversine formula to calculate distance between two points on Earth
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance.toFixed(2); // Return distance in kilometers with 2 decimal places
}

// Helper function to convert degrees to radians
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Handler for time validation
async function handleTimeValidation(message, phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  if (userContext.stage === "EXPECTING_CUSTOM_TIME") {
    const timeInput = message.text.body.trim();
    const is24HourFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeInput);
    const is12HourFormat = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*[AaPp][Mm]$/.test(
      timeInput
    );

    if (is24HourFormat || is12HourFormat) {
      userContext.pickupTime = timeInput;
      userContext.stage = "EXPECTING_SEATS";
      userContexts.set(phone, userContext);

      // Proceed to seat selection
      await sendSeatSelectionMessage(phone, phoneNumberId);
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid time format. Please enter time as 12:00 PM or 13:00",
          },
        },
        phoneNumberId
      );
    }
  } else if (userContext.stage === "EXPECTING_CUSTOM_TIME_GOODS") {
    const timeInput = message.text.body.trim();
    const is24HourFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeInput);
    const is12HourFormat = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s*[AaPp][Mm]$/.test(
      timeInput
    );

    if (is24HourFormat || is12HourFormat) {
      userContext.pickupTime = timeInput;
      userContext.stage = "EXPECTING_QUANTITY_GOODS";
      userContexts.set(phone, userContext);

      // Proceed to quantity selection
      await sendQuantitySelectionMessage(phone, phoneNumberId);
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Invalid time format. Please enter time as 12:00 PM or 13:00",
          },
        },
        phoneNumberId
      );
    }
  }
}

// Insurance services codes + the webhooks above
// Initial welcome message
async function sendWelcomeMessage(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "WELCOME"; // Stage set to "WELCOME"
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Welcome to Ikanisa\nInsurance Services!",
      },
      body: {
        text: "What would you like to do today?",
      },
      footer: {
        text: "Select an action to proceed",
      },
      action: {
        button: "View Options",
        sections: [
          {
            title: "Insurance Services",
            rows: [
              {
                id: "get_insurance",
                title: "Get Insurance",
                description: "Apply for a new insurance policy",
              },
              // {
              //   id: "file_claim",
              //   title: "File Claim",
              //   description: "Submit a new insurance claim",
              // },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Claim Filing Process
async function initiateClaimProcess(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Claim Filing Process",
      },
      body: {
        text: "Gather the following documents for your claim:",
      },
      action: {
        button: "Add Documents",
        sections: [
          {
            title: "Required Documents",
            rows: [
              {
                id: "add_driver_license",
                title: "Driver's License",
                description: "Upload driver license details",
              },
              {
                id: "add_logbook",
                title: "Vehicle Logbook",
                description: "Upload vehicle registration document",
              },
              {
                id: "add_insurance_cert",
                title: "Insurance Certificate",
                description: "Upload current insurance document",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Get insurance document
async function requestInsuranceDocument(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: "Please upload a clear image or PDF of your current or old insurance certificate.",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContexts.set(phone, userContext);
}

// Vehicle Information Collection
async function requestVehiclePlateNumber(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: "Please provide your vehicle's number plate (e.g., RAD 123A):",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// State Insurance Duration
async function stateInsuranceDuration(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_STATE_INSURANCE_DURATION";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Vehicle Plate Number: ${plateNumber}\n\nHow long do you need your insurance to last?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "full_year",
              title: "Full Year",
            },
          },
          {
            type: "reply",
            reply: {
              id: "less_than_a_year",
              title: "Less Than A Year",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Start  Date
async function startDate(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_START_DATE";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `Provide inception date.(e.g: DD/MM/YYYY, 02/01/2100)`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function endDate(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_END_DATE";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `Provide end date.(e.g: DD/MM/YYYY, 04/01/2025)`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Period Selection
async function selectInsurancePeriod(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_INSURANCE_PERIOD";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Vehicle Plate Number: ${plateNumber}\n\nWhen would you like your insurance to start?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "start_today",
              title: "Start Today",
            },
          },
          {
            type: "reply",
            reply: {
              id: "custom_date",
              title: "Choose Custom Date",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Cover Types
async function selectInsuranceCoverType(phone, phoneNumberId) {
  const payload = {
    //messaging_product: "whatsapp",
    //to: formattedPhone,
    type: "template",
    template: {
      name: "insurancecovermessage", 
      language: {
        code: "en_US", // Replace with the appropriate language code
      },
      components: [
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "payload",
              payload: "597083186423112", 
            },
          ],
        },
      ],
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function selectToAddPersonalAccidentCover(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Would you like to add Personal Accident Cover?`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "add_yes",
              title: "Yes",
            },
          },
          {
            type: "reply",
            reply: {
              id: "add_no",
              title: "No",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "PERSONAL_ACCIDENT_COVER";
  userContexts.set(phone, userContext);
}

// Personal Accident Cover Categories
async function selectPersonalAccidentCategory(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Personal Accident Cover Categories",
      },
      body: {
        text: "Based on coverage levels:",
      },
      action: {
        button: "Select Category",
        sections: [
          {
            title: "Coverage Categories",
            rows: [
              {
                id: "cat_1",
                title: "CAT 1",
                description:
                  "Death/Disability: FRW 1,000,000 | Medical: FRW 100,000",
              },
              {
                id: "cat_2",
                title: "CAT 2",
                description:
                  "Death/Disability: FRW 2,000,000 | Medical: FRW 200,000",
              },
              {
                id: "cat_3",
                title: "CAT 3",
                description:
                  "Death/Disability: FRW 3,000,000 | Medical: FRW 300,000",
              },
              {
                id: "cat_4",
                title: "CAT 4",
                description:
                  "Death/Disability: FRW 4,000,000 | Medical: FRW 400,000",
              },
              {
                id: "cat_5",
                title: "CAT 5",
                description:
                  "Death/Disability: FRW 5,000,000 | Medical: FRW 500,000",
              },
              // Add more categories...
              {
                id: "risk_taker",
                title: "No Cover",
                description: "I'm a risk taker!",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Number of Covered People
async function numberOfCoveredPeople(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  // Set the context to expect number of people
  userContext.stage = "EXPECTING_NUMBER_OF_PEOPLE";
  userContexts.set(phone, userContext);
  const payload = {
    type: "text",
    text: {
      body: "How many people to be covered? (e.g., 1, 4, etc):",
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function selectVehicleBodyType(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Select Vehicle Body Type",
      },
      body: {
        text: "Choose the body type of your vehicle from the options below:",
      },
      action: {
        button: "Select Body Type",
        sections: [
          {
            title: "Body Types",
            rows: [
              {
                id: "side_cars_motor_bikes",
                title: "Small & nimble vehicles",
                description: "Side Cars & Motor Bikes, Tricycles",
              },
              {
                id: "car_voiture",
                title: "Car/Voiture",
                description: "Standard passenger cars.",
              },
              {
                id: "jeep_suv",
                title: "Jeep/SUV",
                description: "Sport Utility Vehicles.",
              },
              {
                id: "pickup",
                title: "Small lorries under 5TN",
                description: "Pickup_Camionnenette (small lorry (< 5 tonnes))",
              },
              {
                id: "minibus_van",
                title: "Minibus/Van",
                description: "Minibuses and vans for more passengers.",
              },
              {
                id: "school_bus",
                title: "School bus",
                description: "Buses used for school transportation.",
              },
              {
                id: "bus",
                title: "Bus",
                description: "Large passenger buses.",
              },
              {
                id: "trailer_semi_trailer",
                title: "Trailers & semi-trailers",
                description: "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)",
              },
              {
                id: "howo_shacman_fuso_faw",
                title: "Heavy-duty trucks",
                description: "HOWO, SHACMAN, FUSO, FAW",
              },
              {
                id: "truck_tractor_lorry",
                title: "Large lorries & tractors",
                description: "Truck (Camion) & Tractor, Lorry>= 5 TN – Camionnette",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}





async function selectPaymentPlan(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  
  // Create a VehicleModel instance from stored data
  const vehicle = new VehicleModel(
    "", //userContext.tin,
    userContext.licensedToCarryNumber, // or sitNumber
    "", //userContext.year,
    "", //userContext.make,
    "", //userContext.model,
    "", //userContext.vin,
    userContext.plateNumber,
    userContext.bodyType,
    userContext.extractedData && userContext.extractedData.usageType ? String(userContext.extractedData.usageType) : "Private", //userContext.usageType,
    "", //userContext.fuelType,
    "", //userContext.vehicleValue,
    "", //userContext.engineSize,
    [] //userContext.images || []
  );



// Enhanced parseDate function with better validation
function parseDate(dateStr) {
  if (!dateStr) {
    throw new Error("Date string is required");
  }
  
  dateStr = String(dateStr);
  const parts = dateStr.split('/');
  
  if (parts.length !== 3) {
    throw new Error("Invalid date format: expected DD/MM/YYYY");
  }
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    throw new Error("Date parts must be numeric");
  }
  
  if (day < 1 || day > 31 || month < 0 || month > 11 || year < 2000) {
    throw new Error("Date values out of valid range");
  }
  
  const date = new Date(year, month, day);
  
  // Check if the date is valid (e.g., not Feb 30)
  if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
    throw new Error("Invalid date combination");
  }
  
  return date;
}
  
  // Debug: Log the date values
  console.log("Insurance dates received:", {
    startDate: userContext.insuranceStartDate,
    endDate: userContext.insuranceEndDate
  });

  

  let start = parseDate(userContext.insuranceStartDate);
  let end = parseDate(userContext.insuranceEndDate);
  let calculatedTotalPerVehicle;
  

  // Calculate pricing using the imported CalculatePricing class
  const pricingObj = new CalculatePricing(vehicle, start, end, false);

  // Choose the total cost as needed – for example, full comprehensive premium:
  //const calculatedTotalPerVehicle = pricingObj.comesa;
  if (userContext.coverType === "COMESA") {
    calculatedTotalPerVehicle = pricingObj.comesa;
  } else {
    calculatedTotalPerVehicle = pricingObj.premium;
  }
  
  // Format numbers with commas
  const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  // Calculate the breakdown based on insurance type (Rwanda or COMESA)
  const getBreakdown = () => {
    const isComesa = userContext.coverType === 'COMESA';
    const baseAmount = calculatedTotalPerVehicle; 
    const occupantFee = (userContext.numberOfCoveredPeople || 4) * (isComesa ? 0 : 1000);
    const comesaMedicalFee = isComesa ? 10000 : 0;
    const netPremium = baseAmount + occupantFee + comesaMedicalFee;
    const adminFee = isComesa ? 5000 : 2500; // Yellow card fee for COMESA
    const vat = Math.round(netPremium * 0.18);
    const sgf = Math.round(netPremium * 0.09);
    const total = netPremium + adminFee + vat + sgf;

    return {
      tpl: baseAmount,
      occupantFee,
      comesaMedicalFee,
      netPremium,
      adminFee,
      vat,
      sgf,
      total
    };
  };

  
  // Use default values if required data is missing
  const coverType = userContext.coverType || 'Rwanda';
  const numberOfCoveredPeople = userContext.numberOfCoveredPeople || 1;
  
  // Ensure we have required context data
  if (!userContext.coverType || !numberOfCoveredPeople) {
    console.error("Missing required context data");
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: "Sorry, we're missing some required information. Please start over."
        }
      },
      phoneNumberId
    );
    return;
  }

  const breakdown = getBreakdown();
  
  // Create the detailed breakdown text
 // const breakdownText = `Insurance Premium Breakdown:\nType of Cover         ${userContext.coverType}\nTPL                   ${formatNumber(breakdown.tpl)}\nOccupant              ${userContext.numberOfCoveredPeople}\nCOMESA Medical Fee    ${formatNumber(breakdown.comesaMedicalFee)}\nNET PREMIUM           ${formatNumber(breakdown.netPremium)}\nAdm.fee/Yellow Card   ${formatNumber(breakdown.adminFee)}\nVAT(18%)              ${formatNumber(breakdown.vat)}\nSGF(9%)               ${formatNumber(breakdown.sgf)}\nTOTAL PREMIUM         ${formatNumber(breakdown.total)}\n\nTOTAL TO PAY          ${formatNumber(breakdown.total)}\nPlease select your preferred payment plan:`;

  // Calculate the longest label length
const labels = [
  'Type of Cover',
  'TPL',
  'Occupant',
  'COMESA Medical Fee',  
  'NET PREMIUM',
  'Adm.fee/Yellow Card', // Longest label - will be our reference
  'VAT(18%)',
  'SGF(9%)',
  'TOTAL PREMIUM',
  'TOTAL TO PAY'
];

const longestLabelLength = 'Adm.fee/Yellow Card'.length;

// Create the detailed breakdown text with properly aligned values
const breakdownText = `Insurance Premium Breakdown:

Type of Cover${' '.repeat(longestLabelLength - 'Type of Cover'.length)}         ${userContext.coverType}
TPL${' '.repeat(longestLabelLength - 'TPL'.length)}                   ${formatNumber(breakdown.tpl)}
Occupant${' '.repeat(longestLabelLength - 'Occupant'.length)}              ${formatNumber(userContext.numberOfCoveredPeople)} 
COMESA Medical Fee    ${formatNumber(breakdown.comesaMedicalFee)}
NET PREMIUM${' '.repeat(longestLabelLength - 'NET PREMIUM'.length)}          ${formatNumber(breakdown.netPremium)}
Adm.fee/Yellow Card${' '.repeat(longestLabelLength - 'Adm.fee/Yellow Card'.length)}     ${formatNumber(breakdown.adminFee)}
VAT(18%)${' '.repeat(longestLabelLength - 'VAT(18%)'.length)}               ${formatNumber(breakdown.vat)}
SGF(9%)${' '.repeat(longestLabelLength - 'SGF(9%)'.length)}                ${formatNumber(breakdown.sgf)}
TOTAL PREMIUM${' '.repeat(longestLabelLength - 'TOTAL PREMIUM'.length)}       ${formatNumber(breakdown.total)}

TOTAL TO PAY${' '.repeat(longestLabelLength - 'TOTAL TO PAY'.length)}          ${formatNumber(breakdown.total)}

Please select your preferred payment plan:`;
  
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Premium Summary",
      },
      body: {
        text: breakdownText,
      },
      action: {
        button: "Select Payment Plan",
        sections: [
          {
            title: "Payment Options",
            rows: [
              {
                id: "installment_cat1",
                title: "CAT 1 Installment",
                description: `1M (${formatNumber(Math.round(breakdown.total * 0.25))}), 2M (${formatNumber(Math.round(breakdown.total * 0.25))}), 9M (${formatNumber(Math.round(breakdown.total * 0.5))})`,
              },
              {
                id: "installment_cat2",
                title: "CAT 2 Installment",
                description: `3M (${formatNumber(Math.round(breakdown.total * 0.5))}), 9M (${formatNumber(Math.round(breakdown.total * 0.5))})`,
              },
              {
                id: "installment_cat3",
                title: "CAT 3 Installment",
                description: `6M (${formatNumber(Math.round(breakdown.total * 0.75))}), 6M (${formatNumber(Math.round(breakdown.total * 0.25))})`,
              },
              {
                id: "installment_cat4",
                title: "CAT 4 Installment",
                description: `1M (${formatNumber(Math.round(breakdown.total * 0.25))}), 3M (${formatNumber(Math.round(breakdown.total * 0.35))}), 8M (${formatNumber(Math.round(breakdown.total * 0.4))})`,
              },
              {
                id: "full_payment",
                title: "Full Payment",
                description: `Pay ${formatNumber(breakdown.total)} upfront`,
              },
            ],
          },
        ],
      },
    },
  };

  

  // Save the calculated total to userContext
  userContext.calculatedTotal = breakdown.total;
  userContexts.set(phone, userContext);

  // Also update Firestore with the calculated amounts
  await firestore3
    .collection("whatsappInsuranceOrders")
    .doc(userContext.insuranceDocId)
    .update({
      totalCost: breakdown.total,
      netPremium: breakdown.netPremium,
      adminFee: breakdown.adminFee,
      vat: breakdown.vat,
      sgf: breakdown.sgf
    });

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}



// Payment Installment Options - added
async function selectPaymentPlanOld(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Payment Plans",
      },
      body: {
        text: "Choose how you want to pay for your insurance:",
      },
      action: {
        button: "Select Payment Plan",
        sections: [
          {
            title: "Payment Options",
            rows: [
              {
                id: "installment_cat1",
                title: "CAT 1 Installment",
                description: "1M (25%), 2M (25%), 9M (50%)",
              },
              {
                id: "installment_cat2",
                title: "CAT 2 Installment",
                description: "3M (50%), 9M (50%)",
              },
              {
                id: "installment_cat3",
                title: "CAT 3 Installment",
                description: "6M (75%), 6M (25%)",
              },

              {
                id: "installment_cat4",
                title: "CAT 4 Installment",
                description: "1M (25%), 3M (35%), 8M (40%)",
              },
              {
                id: "full_payment",
                title: "Full Payment",
                description: "Pay 100% upfront",
              },
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function confirmAndPay(phone, selectedInstallmentChoice, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  const totalCost = userContext.calculatedTotal || 0; //userContext.totalCost || 0;
  const formatNum = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  let installmentBreakdown = "";

  switch (selectedInstallmentChoice) {
    case "i_cat1":
      installmentBreakdown = `${totalCost * 0.25}`;
      break;
    case "i_cat2":
      installmentBreakdown = `${totalCost * 0.5}`;
      break;
    case "i_cat3":
      installmentBreakdown = `${totalCost * 0.75}`;
      break;
    case "i_cat4":
      installmentBreakdown = `${totalCost * 0.4}`;
      break;
    case "i_catf":
      installmentBreakdown = `${totalCost}`;
      break;
    default:
      installmentBreakdown = "Unknown installment plan.";
  }

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: {
        type: "text",
        text: "Confirm and Pay",
      },
      body: {
        text: "Your selected option includes Admin fees, VAT, and SGF. Do you agree to proceed with the payment?",
      },
      footer: {
        text: `Total: FRW ${formatNum(installmentBreakdown)} for this month`,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "agree_to_terms",
              title: "Agree and Pay",
            },
          },
          {
            type: "reply",
            reply: {
              id: "cancel_payment",
              title: "Cancel",
            },
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  // Set the context to expect number of people
  userContext.stage = "EXPECTING_CONFIRM_PAY";
  userContexts.set(phone, userContext);
}



// Last message 
async function processPayment(phone, paymentPlan, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  userContext.userPhone = phone;
  userContexts.set(phone, userContext);

  const totalCost = userContext.calculatedTotal || userContext.totalCost || 0;
const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  let installmentBreakdown = "";

  switch (paymentPlan) {
    case "installment_cat1":
    case "i_cat1":
      installmentBreakdown = `1 Month: FRW ${formatNumber(totalCost * 0.25)}`;
      userContext.selectedInstallment = "CAT 1";
      break;
    case "installment_cat2":
    case "i_cat2":
      installmentBreakdown = `3 Months: FRW ${formatNumber(totalCost * 0.5)}`;
      userContext.selectedInstallment = "CAT 2";
      break;
    case "installment_cat3":
    case "i_cat3":
      installmentBreakdown = `6 Months: FRW ${formatNumber(totalCost * 0.75)}`;
      userContext.selectedInstallment = "CAT 3";
      break;
    case "installment_cat4":
    case "i_cat4":
      installmentBreakdown = `1 Month: FRW ${formatNumber(totalCost * 0.25)}, 3M: FRW ${formatNumber(totalCost * 0.35)}`;
      userContext.selectedInstallment = "CAT 4";
      break;
    case "full_payment":
    case "i_catf":
      installmentBreakdown = `Full payment: FRW ${formatNumber(totalCost)}`;
      userContext.selectedInstallment = "FULL";
      break;
    default:
      installmentBreakdown = "Unknown payment plan.";
      userContext.selectedInstallment = "UNKNOWN";
  }

  // Ensure we have the latest total cost in the context
  userContext.totalCost = totalCost;
  
  

  const paymentPayload = {
    type: "text",
    text: {
      body: `Please pay with \nMoMo/Airtel to ${250788767816}\nName: Ikanisa\n_______________________\nYour purchase for ${installmentBreakdown} is being processed after your payment is received, you will receive a confirmation shortly.`,
    },
  };

  console.log("Processing payment for:", phone, paymentPlan);

  // Simulate Payment
  await sendWhatsAppMessage(phone, paymentPayload, phoneNumberId);

  const todayFirebase = new Date();
  const formattedDateFirebase = `${todayFirebase
    .getDate()
    .toString()
    .padStart(2, "0")}/${(todayFirebase.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${todayFirebase.getFullYear()}`;

  // Prepare data for main whatsappInsuranceOrders collection
  const insuranceOrderData = {
    userPhone: userContext.userPhone ? String(userContext.userPhone) : "",
    plateNumber: userContext.plateNumber ? String(userContext.plateNumber) : "",
    insuranceStartDate: userContext.insuranceStartDate
      ? String(userContext.insuranceStartDate)
      : "",
    selectedCoverTypes: userContext.selectedCoverTypes
      ? String(userContext.selectedCoverTypes)
      : "",
    selectedPersonalAccidentCoverage: userContext.selectedCoverage
      ? parseFloat(userContext.selectedCoverage)
      : 0.0,
    totalCost: totalCost,
    numberOfCoveredPeople: userContext.numberOfCoveredPeople
      ? parseFloat(userContext.numberOfCoveredPeople)
      : 0.0,
    selectedInstallment: userContext.selectedInstallment,
    insuranceDocumentUrl: userContext.insuranceDocumentUrl
      ? String(userContext.insuranceDocumentUrl)
      : "",
    extractedData: userContext.extractedData ? userContext.extractedData : {},
    sitNumber: userContext.licensedToCarryNumber ? userContext.licensedToCarryNumber : 0,
    creationDate: formattedDateFirebase,
  };

  // Prepare data for vehiclesWhatsapp collection
  const vehicleData = {
    licensePlate: userContext.plateNumber ? String(userContext.plateNumber) : "",
    make: userContext.markAndTypeValue, 
    model: userContext.markAndTypeValue,
    usageType: userContext.extractedData && userContext.extractedData.usageType ? String(userContext.extractedData.usageType) : "Private",
    userId: Number(phone) || 0,
    bodyType: userContext.extractedData && userContext.extractedData.bodyType ? String(userContext.extractedData.bodyType) : "",
    engineSize: userContext.extractedData && userContext.extractedData.engineSize ? Number(userContext.extractedData.engineSize) : 0,
    fuelType: userContext.extractedData && userContext.extractedData.fuelType ? String(userContext.extractedData.fuelType) : "",
    vin: userContext.extractedData && userContext.extractedData.vin ? String(userContext.extractedData.vin) : "",
    year: userContext.extractedData && userContext.extractedData.year ? Number(userContext.extractedData.year) : 0,
    sitNumber: userContext.licensedToCarryNumber ? Number(userContext.licensedToCarryNumber) : 0,
  };

  // Prepare data for quotationsWhatsapp collection
  const quotationData = {
    amount: totalCost,
    registration: userContext.plateNumber ? String(userContext.plateNumber) : "",
    usage: vehicleData.usageType,
    userId: Number(phone) || 0,
    policyHolder: userContext.extractedData && userContext.extractedData.name ? String(userContext.extractedData.name) : "",
    makeModal: userContext.markAndTypeValue,
    coverType: {
      name: userContext.coverType === 'COMESA' ? "COMESA" : "Third-Party",
      Personal_Accident: userContext.selectedCoverage ? Number(userContext.selectedCoverage) : 0,
      damage: 0,
      fire: 0
    },
    totalPaid: "0", // Initially zero until payment is confirmed
    policyStatus: "pending", // Initial status
    licensedToCarry: userContext.licensedToCarryNumber ? Number(userContext.licensedToCarryNumber) : 0,
    instalment: userContext.selectedInstallment,
    startTime: userContext.insuranceStartDate, // Use current date as a placeholder
    endTime: userContext.insuranceEndDate, // Placeholder for 1 year from now
    transactionId: `WHATSAPP_${Date.now()}_${phone.slice(-4)}`,
    insuranceCompanyName: userContext.insuranceCompany || "Insurance Provider"
  };

  try {
    // 1. Save to main whatsappInsuranceOrders collection
    const orderDocRef = await firestore3
      .collection("whatsappInsuranceOrders")
      .add(insuranceOrderData);
    console.log(
      "Insurance order data successfully saved to Firestore with ID:",
      orderDocRef.id
    );
    
    // Update context with the new document ID
    userContext.insuranceDocId = orderDocRef.id;
    userContexts.set(phone, userContext);

    // 2. Save to vehiclesWhatsapp collection
    // Use licensePlate as document ID if available
    if (vehicleData.licensePlate) {
      await firestore3
        .collection("vehiclesWhatsapp")
        .doc(vehicleData.licensePlate)
        .set(vehicleData);
      console.log(
        "Vehicle data successfully saved to vehiclesWhatsapp with ID:",
        vehicleData.licensePlate
      );
    } else {
      const vehicleDocRef = await firestore3
        .collection("vehiclesWhatsapp")
        .add(vehicleData);
      console.log(
        "Vehicle data successfully saved to vehiclesWhatsapp with generated ID:",
        vehicleDocRef.id
      );
    }

    // 3. Save to quotationsWhatsapp collection
    const quotationDocRef = await firestore3
      .collection("quotationsWhatsapp")
      .add(quotationData);
    console.log(
      "Quotation data successfully saved to quotationsWhatsapp with ID:",
      quotationDocRef.id
    );

    // Update insurance order with quotation ID
    await orderDocRef.update({
      quotationId: quotationDocRef.id
    });

  } catch (error) {
    console.error("Error saving data to Firestore:", error.message);
  }

  // Add logic to integrate with payment gateway API if needed.
  console.log("______________________________________");
  console.log("User context after all flows:", userContext);
}

// Last message - get insurance
async function processPaymentOld(phone, paymentPlan, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};

  userContext.userPhone = phone;
  userContexts.set(phone, userContext);

  const totalCost = userContext.totalCost || 0;

  let installmentBreakdown = "";

  switch (paymentPlan) {
    case "i_cat1":
      installmentBreakdown = `1M: FRW ${totalCost * 0.25}`;
      break;
    case "i_cat2":
      installmentBreakdown = `3M: FRW ${totalCost * 0.5}`;
      break;
    case "i_cat3":
      installmentBreakdown = `6M: FRW ${totalCost * 0.75}`;
      break;
    case "i_cat4":
      installmentBreakdown = `8M: FRW ${totalCost * 0.4}`;
      break;
    case "i_catf":
      installmentBreakdown = `Full payment: FRW ${totalCost}`;
      break;
    default:
      installmentBreakdown = "Unknown payment plan.";
  }

  const paymentPayload = {
    type: "text",
    text: {
      body: `Please pay with \nMoMo/Airtel to ${250788767816}\nName: Ikanisa\n_______________________\nYour purchase for ${installmentBreakdown} is being processed after your payment is received, you will receive a confirmation shortly.`,
    },
  };

  console.log("Processing payment for:", phone, paymentPlan);

  // Simulate Payment
  await sendWhatsAppMessage(phone, paymentPayload, phoneNumberId);

  const todayFirebase = new Date();
  const formattedDateFirebase = `${todayFirebase
    .getDate()
    .toString()
    .padStart(2, "0")}/${(todayFirebase.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${todayFirebase.getFullYear()}`;

  const insuranceOrderData = {
    userPhone: userContext.userPhone ? String(userContext.userPhone) : "",
    plateNumber: userContext.plateNumber ? String(userContext.plateNumber) : "",
    insuranceStartDate: userContext.insuranceStartDate
      ? String(userContext.insuranceStartDate)
      : "",
    selectedCoverTypes: userContext.selectedCoverTypes
      ? String(userContext.selectedCoverTypes)
      : "",
    selectedPersonalAccidentCoverage: userContext.selectedCoverage
      ? parseFloat(userContext.selectedCoverage)
      : 0.0,
    totalCost: userContext.totalCost ? parseFloat(userContext.totalCost) : 0.0,
    numberOfCoveredPeople: userContext.numberOfCoveredPeople
      ? parseFloat(userContext.numberOfCoveredPeople)
      : 0.0,
    selectedInstallment: userContext.selectedInstallment
      ? String(userContext.selectedInstallment)
      : "",
    insuranceDocumentUrl: userContext.insuranceDocumentUrl
      ? String(userContext.insuranceDocumentUrl)
      : "",
    extractedData: userContext.extractedData ? userContext.extractedData : {},
    creationDate: formattedDateFirebase,
  };

  try {
    const docRef = await firestore3
      .collection("whatsappInsuranceOrders")
      .add(insuranceOrderData);
    console.log(
      "User data successfully saved to Firestore with ID:",
      docRef.id
    );
    console.log(insuranceOrderData);
  } catch (error) {
    console.error("Error saving user data to Firestore:", error.message);
  }

  // Add logic to integrate with payment gateway API if needed.
  console.log("______________________________________");
  console.log("User context after all flows:", userContext);
}


// MultivendorMessaging


// Function to extract phone number without country code
const removeCountryCode = (phone) => {
  return phone.replace(/^\+\d{1,3}/, '');
};

// Create a function to handle vendor document changes
const setupVendorKeywordListener = () => {
  // Listen for documents in vendors collection
  firestore2.collection('mt_vendors').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const vendorId = change.doc.id;
      const vendorData = change.doc.data();
      
      // Only proceed if we have phone numbers
      if (vendorData.phone) {
        // Handle main phone number
        const phoneWithoutCountry = removeCountryCode(vendorData.phone);
        const keyword = `${phoneWithoutCountry}ICUPA`;
        addKeywordToTextHandler(keyword, vendorId);
      }
      
      // Handle tMoney number if different from main phone
      if (vendorData.tMoney && vendorData.tMoney !== vendorData.phone) {
        const tMoneyWithoutCountry = removeCountryCode(vendorData.tMoney);
        const tMoneyKeyword = `${tMoneyWithoutCountry}ICUPA`;
        addKeywordToTextHandler(tMoneyKeyword, vendorId);
      }
    });
  });
};



// Initialize default cases
const initializeDefaultCases = () => {
  textMessageCases.set('adminclear', async (userContext) => {
    userContexts.clear();
    console.log("All user contexts reset.");
  });
  
  textMessageCases.set('clear', async (userContext, phone) => {
    userContexts.delete(phone);
    console.log("User context reset.");
  });
  
  textMessageCases.set('test', async (userContext, phone, phoneNumberId) => {
    await sendWhatsAppMessage(
      phone,
      { type: "text", text: { body: "This is the test message" } },
      phoneNumberId
    );
  });

  textMessageCases.set('insurance', async (userContext, phone, phoneNumberId) => {
    await sendWelcomeMessage(phone, phoneNumberId);
  });
  
  textMessageCases.set('lifuti', async (userContext, phone, phoneNumberId) => {
    await sendLifutiWelcomeMessage(phone, phoneNumberId);
  });

  
  // Add your existing static cases
  textMessageCases.set('menu1', {
    vendorId: "3Wy39i9qx4AuICma9eQ6"
  });
  
  textMessageCases.set('icupa', {
    vendorId: "Kj2SXykhWihamsIDhSnb"
  });
  
  textMessageCases.set('menu2', {
    vendorId: "Kj2SXykhWihamsIDhSnb"
  });
  
  textMessageCases.set('menu3', {
    vendorId: "alSIUvz0JNmugFDoJ3En"
  });
  
  // Initialize existing vendor keywords
  initializeExistingVendors();
};

// Function to initialize keywords for existing vendors
const initializeExistingVendors = async () => {
  try {
    const vendorsSnapshot = await firestore2.collection('mt_vendors').get();
    vendorsSnapshot.forEach((doc) => {
      const vendorId = doc.id;
      const vendorData = doc.data();
      
      if (vendorData.phone) {
        const phoneWithoutCountry = removeCountryCode(vendorData.phone);
        const keyword = `${phoneWithoutCountry}ICUPA`;
        addKeywordToTextHandler(keyword, vendorId);
      }
      
      if (vendorData.tMoney && vendorData.tMoney !== vendorData.phone) {
        const tMoneyWithoutCountry = removeCountryCode(vendorData.tMoney);
        const tMoneyKeyword = `${tMoneyWithoutCountry}ICUPA`;
        addKeywordToTextHandler(tMoneyKeyword, vendorId);
      }
    });
    console.log('Initialized existing vendor keywords');
  } catch (error) {
    console.error('Error initializing vendor keywords:', error);
  }
};

// Function to add new keyword
const addKeywordToTextHandler = (keyword, vendorId) => {
  textMessageCases.set(keyword.toLowerCase(), {
    vendorId: vendorId
  });
  console.log(`Added keyword handler for: ${keyword} with vendorId: ${vendorId}`);
};



// Initialize the system
const initializeSystem = () => {
  initializeDefaultCases();
  setupVendorKeywordListener();
};

// Call initialization after Firebase is set up
initializeSystem();



// --- Helper: Firestore Data Fetching ---
// Fetch all documents from a given collection and return an object mapping doc.id to data.
async function fetchData(collectionName) {
  const snapshot = await firestore2.collection(collectionName).get();
  const docs = {};
  snapshot.forEach((doc) => {
    docs[doc.id] = { id: doc.id, ...doc.data() };
  });
  return docs;
}

// --- Helper: Pagination ---
// Returns rows for the current page (with pageSize items per page)
function paginateRows(rows, page = 0, pageSize = 9) {
  const start = page * pageSize;
  return rows.slice(start, start + pageSize);
}

// --- Helper: String Truncation ---
// Enforce maximum lengths for title and description.
const MAX_TITLE_LENGTH = 23;
const MAX_DESCRIPTION_LENGTH = 71;
function truncateString(str, maxLength) {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

// --- 1. Send Class Selection Message ---
// When "menu" is received, prompt the user to select a class (Food or Drinks).
async function sendClassSelectionMessage(phone, phoneNumberId) {
  let userContext = userContexts.get(phone) || {};
  userContext.stage = "CLASS_SELECTION";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "text", text: "Feeling hungry or just thirsty?" },
      body: { text: "Choose your fix! 🍕🥂" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CLASS_FOOD", title: "Food" } },
          { type: "reply", reply: { id: "CLASS_DRINKS", title: "Drinks" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}



// --- 2. Send Category Selection Message ---
async function sendCategorySelectionMessage(phone, phoneNumberId, selectedClass) {
  try {
    // Fetch sub-categories from "mt_subCategories" and products from "mt_products"
    const subCategoriesData = await fetchData("mt_subCategories");
    const productsData = await fetchData("mt_products");

    // Get the vendor ID from the user context.
    let userContext = userContexts.get(phone) || { order: [], page: 0 };
    const vendorId = userContext.vendorId;

    // Filter sub-categories whose "classes" field matches the selected class.
    // Then, keep only those that have at least one active product (from mt_products)
    // with matching class, (if set) vendor, and that use this sub-category.
    const filteredSubCategories = Object.values(subCategoriesData)
      .filter((subCat) => (subCat.classes || "").toLowerCase() === selectedClass.toLowerCase())
      .filter((subCat) => {
        return Object.values(productsData).some((prod) => {
          if (prod.active !== true) return false;
          if ((prod.classes || "").toLowerCase() !== selectedClass.toLowerCase()) return false;
          if (vendorId && prod.vendor !== vendorId) return false;
          return prod.subcategory === subCat.id; // product references this sub-category
        });
      });

    // Map the filtered sub-categories to interactive list rows (with title and description truncation)
    const allRows = filteredSubCategories.map((subCat) => {
      return {
        id: subCat.id,
        title: truncateString(subCat.name, MAX_TITLE_LENGTH),
        description: truncateString(subCat.description, MAX_DESCRIPTION_LENGTH)
      };
    });

    // Paginate rows (maximum 9 rows per page)
    const currentPage = userContext.page || 0;
    let rows = paginateRows(allRows, currentPage, 9);
    const hasMore = (currentPage + 1) * 9 < allRows.length;
    if (hasMore) {
      rows.push({
        id: "MORE_ITEMS",
        title: "More Items",
        description: "Tap to see more categories"
      });
    }

    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "What’s your flavor today?" },
        body: { text: "🍔🍹 Pick a category!" },
        action: {
          button: "Select Category",
          sections: [
            {
              title: "Categories",
              rows: rows
            }
          ]
        }
      }
    };

    userContext.stage = "CATEGORY_SELECTION";
    userContexts.set(phone, userContext);
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendCategorySelectionMessage:", error.message);
  }
}



// --- 3. Send Product Selection Message ---
async function sendProductSelectionMessage(phone, phoneNumberId, selectedClass, selectedSubCategory) {
  let userContext = userContexts.get(phone) || { order: [], page: 0 };
  try {
    // Fetch products from "mt_products"
    const productsData = await fetchData("mt_products");
    // (Fetching subCategories is optional here if you need it elsewhere)
    const subCategoriesData = await fetchData("mt_subCategories");

    const vendorId = userContext.vendorId;

    // Filter products that:
    // - are active,
    // - have a matching "classes" value,
    // - (if vendorId is set) belong to that vendor, and
    // - whose subcategory equals the selected subcategory.
    const filteredProducts = Object.values(productsData).filter((prod) => {
      if (prod.active !== true) return false;
      if ((prod.classes || "").toLowerCase() !== selectedClass.toLowerCase()) return false;
      if (vendorId && prod.vendor !== vendorId) return false;
      return prod.subcategory === selectedSubCategory;
    });

    // If there are no products, notify the user.
    if (filteredProducts.length === 0) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "There are no products available in this subcategory." }
        },
        phoneNumberId
      );
      return;
    }

    // Create a mapping from product id to its data for later lookup
    const productData = {};
    // Map products to interactive list rows (with title and description truncation)
    const allRows = filteredProducts.map((prod) => {
      productData[prod.id] = { price: prod.price, name: prod.name };
      const fullDescription = `Price: €${prod.price} | ${prod.description}`;
      
      return {
        id: prod.id,
        title: truncateString(prod.name, MAX_TITLE_LENGTH),
        description: truncateString(fullDescription, MAX_DESCRIPTION_LENGTH)
      };
    });

    // Save product data in the user context for later lookup.
    userContext.productData = productData;

    // Use pagination (9 rows per page)
    const currentPage = userContext.page || 0;
    let rows = paginateRows(allRows, currentPage, 9);
    const hasMore = (currentPage + 1) * 9 < allRows.length;
    if (hasMore) {
      rows.push({
        id: "MORE_ITEMS",
        title: "More Items",
        description: "Tap to see more products"
      });
    }

    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Ready to treat yourself?" },
        body: { text: "Select your favorite. 😋" },
        action: {
          button: "Select Product",
          sections: [
            {
              title: "Products",
              rows: rows
            }
          ]
        }
      }
    };

    userContext.stage = "PRODUCT_SELECTION";
    userContexts.set(phone, userContext);
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendProductSelectionMessage:", error.message);
  }
}


// Based on the selected class and category, fetch products from "mt_products" and filter using data from "mt_subCategories".
async function sendProductSelectionMessageDraft(phone, phoneNumberId, selectedClass, selectedCategory) {
  let userContext = userContexts.get(phone) || { order: [], page: 0 };
  try {
    // Fetch products from "mt_products"
    const productsData = await fetchData("mt_products");
    // Fetch sub-categories from "mt_subCategories"
    const subCategoriesData = await fetchData("mt_subCategories");

    const vendorId = userContext.vendorId;

    // Filter products: active === true, classes match, and the product's subcategory's 'category' field equals selectedCategory.
    const filteredProducts = Object.values(productsData).filter((prod) => {
      if (prod.active !== true) return false;
      if (prod.classes.toLowerCase() !== selectedClass.toLowerCase()) return false;
      if (vendorId && prod.vendor !== vendorId) return false;
      // Look up the sub-category document using prod.subcategory as the key.
      const subCat = subCategoriesData[prod.subcategory];
      if (!subCat) return false;
      // Check if the sub-category's 'category' field matches the selectedCategory (doc.id from mt_categories)
      return subCat.category === selectedCategory;
    });


    // If there are no products, send a text message and exit.
    if (filteredProducts.length === 0) {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "There are no products available in this category." }
        },
        phoneNumberId
      );
      return;
    }

    // Create a mapping from product id to its data (price, name, etc.)
    const productData = {};
    // Map products to interactive list rows with truncation.
    const allRows = filteredProducts.map((prod) => {
      // Save the product data for later lookup.
      productData[prod.id] = { price: prod.price, name: prod.name };
      const fullDescription = `Price: €${prod.price} | ${prod.description}`;
      
      return {
        id: prod.id, // This id will be returned in the interactive reply.
        title: truncateString(prod.name, MAX_TITLE_LENGTH),
        description: truncateString(fullDescription, MAX_DESCRIPTION_LENGTH)
      };
    });

     // Store the mapping in the user context for later lookup.
    userContext.productData = productData;

    // Use pagination for products.
    
    const currentPage = userContext.page || 0;
    let rows = paginateRows(allRows, currentPage, 9);
    const hasMore = (currentPage + 1) * 9 < allRows.length;
    if (hasMore) {
      rows.push({
        id: "MORE_ITEMS",
        title: "More Items",
        description: "Tap to see more products"
      });
    }

    const payload = {
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "Ready to treat yourself?" },
        body: { text: "Select your favorite. 😋" },
        action: {
          button: "Select Product",
          sections: [
            {
              title: "Products",
              rows: rows
            }
          ]
        }
      }
    };

    userContext.stage = "PRODUCT_SELECTION";
    userContexts.set(phone, userContext);
    await sendWhatsAppMessage(phone, payload, phoneNumberId);
  } catch (error) {
    console.error("Error in sendProductSelectionMessage:", error.message);
  }
}



// --- 4. Send Order Prompt ---
// After a product selection, ask the user if they want to add more items or finish the order.
async function sendOrderPrompt(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `*Your order’s looking good!*\nWant to add anything else before checkout? 🍕🍷` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "MORE", title: "More" } },
          { type: "reply", reply: { id: "ORDER", title: "Checkout" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

async function sendTable(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const payload = {
    type: "text",
    text: {
      body: `*Where to serve you?* 📍\nEnter your table number! (eg 1, 2, 3…)`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContext.stage = "TABLE_SELECTION";
    userContexts.set(phone, userContext);
}
// --- 5. Send Order Summary ---
// When the user finishes ordering, send a summary of the order.
async function sendOrderSummary(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const order = userContext.order || [];

  if (order.length === 0) {
    await sendWhatsAppMessage(phone, {
      type: "text",
      text: { body: "You have not ordered any items yet." }
    }, phoneNumberId);
    return;
  }

  // Create an order line for each item and compute the total amount.
  const orderLines = order.map((item, idx) => `${idx + 1}. ${item.name} - €${item.price}`);
  const totalAmount = order.reduce((sum, item) => sum + Number(item.price), 0);
  
  const summaryText = `*Your order lineup!*🔥 \nDouble-check before we send it in.\n${orderLines.join("\n")}\n\nTotal: €${totalAmount}`;


  

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: summaryText },
      action: {
        buttons: [
          { type: "reply", reply: { id: "PAY", title: "Send" } },
          { type: "reply", reply: { id: "ADD_MORE", title: "Add More" } },
          { type: "reply", reply: { id: "CANCEL", title: "Cancel" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Optionally clear the user's context.
  userContext.stage = "PAY_PROMPT";
  userContexts.set(phone, userContext);
  
}

// This function creates a new order document in Firestore using the data collected in userContext.
async function createWhatsappOrder(phone) {
  let userContext = userContexts.get(phone) || {};
  if (!userContext) return;
  
  const order = userContext.order || [];
  const totalAmount = order.reduce((sum, item) => sum + Number(item.price), 0);
  
  // Generate order ID: "ORD-" + YYYYMMDD + "-" + random 6-digit number.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const orderId = `ORD-${yyyy}${mm}${dd}-${randomDigits}`;
  
  // Build products array. Each product includes:
  // - price, product (the product doc id), quantity (default 1), rejected (false), served (false)
  const products = order.map(item => ({
    price: Number(item.price),
    product: item.id,
    quantity: 1
  }));
  
  // Build order object using provided structure.
  const orderObj = {
    accepted: false,
    amount: totalAmount,
    date: admin.firestore.FieldValue.serverTimestamp(),
    orderId: orderId,
    paid: false,
    phone: phone,
    products: products,
    rejected: false,
    served: false,
    table: userContext.table,           // Modify if table information is available.
    user: phone,          // Here, we use the phone as the user identifier.
    vendor: userContext.vendorId
  };
  
  try {
    await firestore2.collection("mt_whatsappOrders").add(orderObj);
    console.log("Order created with ID:", orderId);
  } catch (error) {
    console.error("Error creating order in Firestore:", error.message);
  }
}

// Payment Information
async function sendPaymentInfo(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  if (!userContext) {
    console.log("No user context found for phone:", phone);
    return;
  }

   // First, create the order document in Firestore.
  await createWhatsappOrder(phone);
  
  let paymentLink = "Link unavailable";
  try {
    const vendorDoc = await firestore2.collection("mt_vendors").doc(userContext.vendorId).get();
    if (vendorDoc.exists) {
      const vendorData = vendorDoc.data();
      if (vendorData.paymentLink) {
        //paymentLink = vendorData.paymentLink;
        paymentLink = vendorData.paymentLink.replace('https://revolut.me/', '');
      }
    }
  } catch (error) {
    console.error("Error fetching vendor data:", error.message);
  }

  


  // Make sure the template "payment_link_template" is pre-approved by WhatsApp.
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "paymultivendor", // Your approved template name
      language: { code: "en_US" },
      components: [
        {
          // Button component with a URL button.
          // In WhatsApp templates, call-to-action buttons are defined in the template.
          type: "button",
          sub_type: "url",
          index: "0", // The first (or only) button in the template
          parameters: [
            {
              type: "text",
              text: paymentLink
            }
          ]
        }
      ]
    }
  };
  
  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContexts.delete(phone);
}







// --- 12. Start the Server ---
const startServer = async () => {
  try {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      testWhatsAppConnection();
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
};

startServer();
