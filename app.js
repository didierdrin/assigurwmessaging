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
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Timestamp } from 'firebase-admin/firestore';


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
    origin: ["http://localhost:3000", "https://assigurwmessaging.onrender.com", "https://assigu-wa-dashboard.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

//app.use(express.json());
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
            await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate  // Set the id field to match the document's ID
});
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
            await userContext.insuranceDocRef.update({
  insuranceEndDate: userContext.insuranceEndDate  // Set the id field to match the document's ID
});
            break;

          case "EXPECTING_START_DATE_RW":
            const formattedDateRW = `${today
          .getDate()
          .toString()
          .padStart(2, "0")}/${(today.getMonth() + 1)
          .toString()
          .padStart(2, "0")}/${today.getFullYear()}`;

            userContext.insuranceStartDate = messageText; //inputDate;
            userContext.stage = "EXPECTING_END_DATE_RW";
            userContexts.set(phone, userContext);
            await endDateRW(phone, phoneNumberId);
            await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate  // Set the id field to match the document's ID
});
            break;

          case "EXPECTING_END_DATE_RW":
            //const startDate = new Date(userContext.insuranceStartDate);
            const startDateRW = new Date(
              userContext.insuranceStartDate.split("/").reverse().join("-")
            );
            startDateRW.setHours(0, 0, 0, 0); // Reset time part for start date

            // Debug logging
            console.log("Date comparison:", {
              startDate: startDateRW.toISOString(),
              inputDate: inputDate.toISOString(),
              comparison: inputDate > startDateRW
            });

            // Check if end date is after start date
            if (inputDate <= startDateRW) {
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
            await selectInsuranceCoverTypeRW(phone, phoneNumberId);
            await userContext.insuranceDocRef.update({
  insuranceEndDate: userContext.insuranceEndDate  // Set the id field to match the document's ID
});
            break;

          case "CUSTOM_DATE_INPUT":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverType(phone, phoneNumberId);
            await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate  // Set the id field to match the document's ID
});
            break;

          case "CUSTOM_DATE_INPUT_RW":
            userContext.insuranceStartDate = inputDate;
            userContext.stage = "EXPECTING_INSURANCE_COVER_TYPE";
            userContexts.set(phone, userContext);
            await selectInsuranceCoverTypeRW(phone, phoneNumberId);
            await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate  // Set the id field to match the document's ID
});
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
      userContext.thirdPartyComesaCost = 14000; // Not this private 5,000 commercial 10,000
      userContext.coverType = 'Rwanda';
      userContext.bodyType = "Jeep/SUV"; 
      userContext.usageTypeManual = "Private";
      await noticeProforma(phone, phoneNumberId);

        // Update the document to include its own ID userContext.insuranceDocRef
await userContext.insuranceDocRef.update({
  status: "processing",  // Set the id field to match the document's ID
  selectedCoverTypes: selectedCoverTypes
});
      //await selectPaymentPlan(phone, phoneNumberId);
      //await selectVehicleBodyType(phone, phoneNumberId); 
      //await selectToAddPersonalAccidentCover(phone, phoneNumberId);
    }

    // Process specific cover type
   // if (selectedCoverTypes.includes("1_COMESA_Cover")) {
   //   userContext.thirdPartyComesaCost = 10000;
   //   userContext.coverType = 'COMESA'; 
   //   await selectToAddPersonalAccidentCover(phone, phoneNumberId);
   // }

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
        //await sendCustomPickupTimeMessage(phone, phoneNumberId);
        await sendAvailableDriversMessage(phone, phoneNumberId);
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
        //await sendSeatSelectionMessage(phone, phoneNumberId);
        await sendAvailableDriversMessage(phone, phoneNumberId);
      userContext.seats = "0";
      userContexts.set(phone, userContext);
        return;
      } else if (userContext.stage === "EXPECTING_NOW_LATER_GOODS") {
        await sendQuantitySelectionMessage(phone, phoneNumberId);
        return;
      } else {
        console.log("Not the right button");
      }

      break;

    case "done_verification":
      userContext.selectedInstallment = "i_catf";
      userContexts.set(phone, userContext);
      await processPaymentRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      
      //await selectPaymentPlan(phone, phoneNumberId);

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
    case "full_year_rw":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await selectInsurancePeriodRW(
          phone,
          userContext.formattedPlate,
          phoneNumberId
        );
        return;
      }

      break;

    case "ORDERTWO":
      // await sendPaymentInfoTwo(phone, phoneNumberId); 
      // await sendMessageWithUSSDCallButton(phone, phoneNumberId);
      //await sendPaidPhoneNumber(phone, phoneNumberId); 
      await sendTable(phone, phoneNumberId); 
      break; 

    case "copy_ussd":
      const namePayload = {
    type: "text",
    text: {
      body: `*Emeza nimero ya MOMO y'uwishyuye*\nMutegereze gato.`
    }
    
  };
      await new Promise(resolve => setTimeout(resolve, 5000));
      await sendWhatsAppMessage(phone, namePayload,phoneNumberId);
      break;

    case "name_1":
      
      userContext.insuranceDocRef.update({
        paidBool: true, 
      });
      

      const payloadName1 = {
        type: "text",
        text: {
          body: `*Twakiriye ubwishyu!*\nTwakiriye ubwishyu! Ubu turi gukora ibikenewe ngo twohereze icyemezo cy’Ubwishingizi. Mutegereze gato.`
        }
      };

      await sendWhatsAppMessage(phone, payloadName1, phoneNumberId);

      break;
      
    case "name_2":

      const payloadName2 = {
        type: "text",
        text: {
          body: `*Amazina siyo!*\nMurebe neza`
        }
      };
      await sendWhatsAppMessage(phone, payloadName2, phoneNumberId);
 
      break;
      
    case "name_3":
     
      const payloadName3 = {
        type: "text",
        text: {
          body: `*Amazina siyo!*\nMurebe neza`
        }
      };
      await sendWhatsAppMessage(phone, payloadName3, phoneNumberId);
 
      break;
    


    case "no_insurance_document":
      
        await requestYellowCard(
          phone,
          phoneNumberId
        );
        return;
      

      break;

    case "no_insurance_document_rw":
      
        await requestYellowCardRW(
          phone,
          phoneNumberId
        );
        return;
      

      break;
      
    case "less_than_a_year_rw":
      if (userContext.stage === "EXPECTING_STATE_INSURANCE_DURATION") {
        await startDateRW(phone, phoneNumberId);
        return;
      }

      break;
    

    case "add_yes":
      if (userContext.stage === "PERSONAL_ACCIDENT_COVER") {
        //await selectPersonalAccidentCategory(phone, phoneNumberId);
        //console.log("Expecting CAT1.../FULL PAYMENT button reply");
        await selectVehicleBodyType(phone, phoneNumberId); 
        return;
      }

      break;
    case "add_no":
      // Calculate total cost
      //const coverageCost = userContext.selectedCoverage || 0;
      if (userContext.stage === "PERSONAL_ACCIDENT_COVER") {
      userContext.selectedCoverage = 0; // Price for CAT 0 None
      const coverageCost = userContext.thirdPartyComesaCost;
      userContext.totalCost = 1 * coverageCost;

      userContext.stage = null;
      //userContext.numberOfCoveredPeople = 1;
      userContexts.set(phone, userContext);

      await selectVehicleBodyType(phone, phoneNumberId); //await selectPaymentPlan(phone, phoneNumberId);
        return;
      }
      break;
    case "agree_to_terms":
      console.log("User agreed to the terms. Proceeding with payment.");
      await processPayment(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "agree_to_terms_rw":
      console.log("User agreed to the terms. Proceeding with payment.");
      await processPaymentRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    

    case "cancel_payment_rw":
      console.log("User canceled the payment.");
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: {
            body: "Uhagaritse kwishyura. Niba mugize ikibazo mwatumenyesha!",
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
        await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate,   // Set the id field to match the document's ID
          insuranceEndDate: userContext.insuranceEndDate
});
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

    case "start_today_rw":
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
        await selectInsuranceCoverTypeRW(phone, phoneNumberId);
        await userContext.insuranceDocRef.update({
  insuranceStartDate: userContext.insuranceStartDate,  // Set the id field to match the document's ID
          insuranceEndDate: userContext.insuranceEndDate
});
        console.log("Expecting start_today_rw button reply");
        return;
      }

      break;

     case "custom_date_rw":
      if (userContext.stage === "EXPECTING_INSURANCE_PERIOD") {
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: {
              body: "Shyiramo umunsi ubwishingizi butangiriraho. (DD/MM/YYYY, 02/01/2025):",
            },
          },
          phoneNumberId
        );
        userContext.stage = "CUSTOM_DATE_INPUT_RW";
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

    if (!isNaN(numberOfPeople) && numberOfPeople > 0 && numberOfPeople <= 1000) {
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

        await selectVehicleBodyType(phone, phoneNumberId); // or selectPaymentPlan(phone, phoneNumberId);
      } catch (error) {
        console.error("Processing error:", error);
        await sendWhatsAppMessage(
          phone,
          {
            type: "text",
            text: { body: "An error occurred. Please try again." },
          },
          phoneNumberId
        );
      }
    } else {
      await sendWhatsAppMessage(
        phone,
        {
          type: "text",
          text: { body: "Invalid input. Please enter a number between 1 and 1000. For example: 3" },
        },
        phoneNumberId
      );
    }
  } else if (userContext.stage === "EXPECTING_PAID_PHONENUMBER_OLD") {
    const messageText = message.text.body.trim();
    // Preserve the original phone number format
    const paidPhoneNumber = messageText;
    const formattedPaidPhoneNumber = "25" + paidPhoneNumber;

    // Store in user context
    userContext.paidPhoneNo = paidPhoneNumber;
    userContexts.set(phone, userContext);

    try {
      // Query the paymentConfirm collection to check if this phone number exists
      const paymentConfirmSnapshot = await firestore2
        .collection("paymentConfirm")
        .where("payer", "==", formattedPaidPhoneNumber)
        .limit(1)
        .get();

      // Check if we found a matching payment confirmation
      if (!paymentConfirmSnapshot.empty) {
        // Payment confirmed in the collection
        const payloadName1 = {
          type: "text",
          text: {
            body: `*Twakiriye ubwishyu!*\nTwakiriye ubwishyu! Ubu turi gukora ibikenewe ngo twohereze icyemezo cy'Ubwishingizi. Mutegereze gato.`,
          },
        };
        await sendWhatsAppMessage(phone, payloadName1, phoneNumberId);

        // Update the insurance document with payment info
        await userContext.insuranceDocRef.update({
          paidBool: true,
          paidPhoneNumber: paidPhoneNumber,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Read all fields from the original insuranceDocRef (Firestore3)
        const insuranceDocSnapshot = await userContext.insuranceDocRef.get();
        if (insuranceDocSnapshot.exists) {
          const insuranceData = insuranceDocSnapshot.data();

          // Save the entire document to the target Firestore (another firebase app)
          await firestore
            .collection("whatsappInsuranceOrders")
            .doc(insuranceDocSnapshot.id)
            .set(insuranceData, { merge: true });
          console.log(
            `Saved insurance document ${insuranceDocSnapshot.id} with updated payment info to new Firestore.`
          );
        } else {
          console.log("The phone number has not paid");

          const payloadNotFound = {
            type: "text",
            text: {
              body: `Ntabwo twabashije kubona ubwishyu buhuye n'iyi numero. Mwongere mugerageze cyangwa muvugane n'umukozi wacu.`,
            },
          };
          await sendWhatsAppMessage(phone, payloadNotFound, phoneNumberId);
        }
      } // End if payment confirmation exists
    } catch (error) {
      console.error("Error verifying payment:", error);

      const payloadError = {
        type: "text",
        text: { body: `Hari ikibazo cyavutse. Mwongere mugerageze nyuma y'akanya gato.` },
      };
      await sendWhatsAppMessage(phone, payloadError, phoneNumberId);
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
    //await sendOrderSummary(phone, phoneNumberId);
    // await sendOrderPrompt(phone, phoneNumberId);

    // Save the order to Firestore
    await createWhatsappOrderNew(phone);
    
    const payload = {
      type: "text",
      text: {
        body: `*Order Placed | Pay*\nYou'll get your order in a little bit.`
      }
    };

    await sendWhatsAppMessage(phone, payload, phoneNumberId); 
    userContext.stage = null;
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

    case "quickrides":
      // Send location request message
      const quickLocationRequestPayload = {
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: {
            text: "Share your current location",
          },
          action: {
            name: "send_location",
          },
        },
      };

      await sendWhatsAppMessage(phone, quickLocationRequestPayload, phoneNumberId);

      userContext.serviceType = "quickrides";
      userContext.stage = "EXPECTING_PICKUP_ADDRESS_QUICKRIDES";
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
      await requestNationalId(phone, phoneNumberId);
      //await requestInsuranceDocument(phone, phoneNumberId);
      break;

    case "get_insurance_rw":
      await requestNationalIdRW(phone, phoneNumberId);
      break;

    case "third_party_rw":
      userContext.thirdPartyComesaCost = 14000; // Not this private 5,000 commercial 10,000
      userContext.coverType = 'Rwanda'; 
      userContext.bodyType = "Jeep/SUV"; 
      userContext.usageTypeManual = "Private";
      userContext.selectedCoverTypes = "0_Third-Party_Cover_";
  
      userContexts.set(phone, userContext);
      await noticeProformaRW(phone, phoneNumberId);

          // Update the document to include its own ID userContext.insuranceDocRef
await userContext.insuranceDocRef.update({
  status: "processing",  // Set the id field to match the document's ID
  selectedCoverTypes: userContext.selectedCoverTypes
});
      //await selectPaymentPlanRW(phone, phoneNumberId);
      //await selectVehicleBodyTypeRW(phone, phoneNumberId); 
      break;

    case "file_claim":
      await initiateClaimProcess(phone, phoneNumberId);
      break;


    case "side_cars_motor_bikes":
      userContext.bodyType = "Side Cars & Motor Bikes, Tricycles"; 
      userContext.usageTypeManual = "Private";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "side_cars_motor_bikes_commercial":
      userContext.bodyType = "Side Cars & Motor Bikes, Tricycles"; 
      userContext.usageTypeManual = "Commercial Passenger"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "car_voiture":
      userContext.bodyType = "Car/Voiture"; 
      userContext.usageTypeManual = "Private";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "car_voiture_commercial":
      userContext.bodyType = "Car/Voiture";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "car_voiture_taxi":
      userContext.bodyType = "Car/Voiture";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "car_voiture_goods":
      userContext.bodyType = "Car/Voiture";
      userContext.usageTypeManual = "Commercial Goods";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "jeep_suv":
      userContext.bodyType = "Jeep/SUV"; 
      userContext.usageTypeManual = "Private";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "jeep_suv_commercial":
      userContext.bodyType = "Jeep/SUV";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;


    case "jeep_suv_taxi":
      userContext.bodyType = "Jeep/SUV";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "jeep_suv_goods":
      userContext.bodyType = "Jeep/SUV"; 
      userContext.usageTypeManual = "Commercial Goods";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "pickup":
      userContext.bodyType = "Pickup_Camionnenette (small lorry (< 5 tonnes))"; 
      userContext.usageTypeManual = "Private"; 
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "pickup_commercial":
      userContext.bodyType = "Pickup_Camionnenette (small lorry (< 5 tonnes))"; 
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "pickup_goods":
      userContext.bodyType = "Pickup_Camionnenette (small lorry (< 5 tonnes))"; 
      userContext.usageTypeManual = "Commercial Goods";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;
      
    case "minibus_van":
      userContext.bodyType = "Minibus/Van"; 
      userContext.usageTypeManual = "Private";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "minibus_van_commercial":
      userContext.bodyType = "Minibus/Van";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "minibus_van_taxi":
      userContext.bodyType = "Minibus/Van";
      userContext.usageTypeManual = "Commercial Passenger";
      userContexts.set(phone, userContext);
      await selectPaymentPlan(phone, phoneNumberId);
      break;

    case "minibus_van_goods":
      userContext.bodyType = "Minibus/Van";
      userContext.usageTypeManual = "Commercial Goods";
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
      
    case "trailer_semi_trailer_goods":
      userContext.bodyType = "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)"; 
      userContext.usageTypeManual = "Commercial Goods";
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

    case "installment_cat1_rw":
      userContext.selectedInstallment = "i_cat1";
      userContexts.set(phone, userContext);
      await confirmAndPayRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat2_rw":
      userContext.selectedInstallment = "i_cat2";
      userContexts.set(phone, userContext);
      await confirmAndPayRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat3_rw":
      userContext.selectedInstallment = "i_cat3";
      userContexts.set(phone, userContext);
      await confirmAndPayRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "installment_cat4_rw":
      userContext.selectedInstallment = "i_cat4";
      userContexts.set(phone, userContext);
      await confirmAndPayRW(
        phone,
        userContext.selectedInstallment,
        phoneNumberId
      );
      break;

    case "full_payment_rw":
      userContext.selectedInstallment = "i_catf";
      userContexts.set(phone, userContext);
      await confirmAndPayRW(
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
        const classId = message.interactive.button_reply.id; // Expecting "CLASS_FOOD" or "CLASS_DRINKS"
        const selectedClass = classId === "CLASS_FOOD" ? "Food" : classId === "CLASS_DRINKS" ? "Drinks" : undefined;
        
        if (!selectedClass) {
          console.error("Invalid class selection received:", classId);
          throw new Error("Invalid class selection received.");
        }
        
        userContext.selectedClass = selectedClass;
        userContexts.set(phone, userContext);
        
        // Forward the selected class to the catalog function.
        await sendDefaultCatalog(phone, phoneNumberId, selectedClass);
        userContext.stage = "CLASS_SELECTION";
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
        } else if (buttonId === "ORDERTWO") {
          //await sendOrderSummary(phone, phoneNumberId);
          //await sendTable(phone, phoneNumberId);
          await sendPaymentInfo(phone, phoneNumberId); 
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




// 3. Updated document upload handler with new flow order
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

  // Check what type of document we're expecting
  const expectedDocumentType = userContext.expectingDocumentType || "nationalId";
  
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
          body: `Invalid file type. Please upload a clear image or PDF of your ${expectedDocumentType} document.`,
        },
      },
      phoneNumberId
    );
    return;
  }

  try {
    console.log(`Received a ${expectedDocumentType} document:`, mediaId);

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
    
    // Define folder based on document type
    let folderName;
    switch (expectedDocumentType) {
      case "nationalId":
        folderName = "national_id_documents";
        break;
      case "yellowCard":
        folderName = "yellow_card_documents";
        break;
      case "carImage":
        folderName = "car_images";
        break;
      case "nationalId_rw":
        folderName = "national_id_documents";
        break;
      case "yellowCard_rw":
        folderName = "yellow_card_documents";
        break;
      case "carImage_rw":
        folderName = "car_images";
        break;
      default:
        folderName = "insurance_documents";
    }
    
    const fileName = `${folderName}/${phone}_${Date.now()}${fileExtension}`;

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

    // 5. Initialize or get existing Firestore document
    let docRef;
    
    if (!userContext.insuranceDocId) {
      // First document being processed - create new record
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, "0")}/${(
        today.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}/${today.getFullYear()}`;
      //const realCreationDate1 = new admin.firestore.Timestamp.fromDate(formattedDate);

      const initialData = {
        userPhone: phone,
        paidBool: false,
        status: '',
        creationDate: admin.firestore.Timestamp.now(),
        // These will be filled in later as needed
        plateNumber: "",
        insuranceStartDate: "",
        selectedCoverTypes: "",
        numberOfCoveredPeople: 0,
        selectedPersonalAccidentCoverage: 0,
        totalCost: 0,
        selectedInstallment: "",
      };
      
      // Create document and save the reference
      docRef = await firestore3
        .collection("whatsappInsuranceOrders")
        .add(initialData);

      // Update the document to include its own ID userContext.insuranceDocRef
await docRef.update({
  id: docRef.id  // Set the id field to match the document's ID
});
        
      console.log("New document reference created in Firestore");
      userContext.insuranceDocId = docRef.id;
      userContext.insuranceDocRef = docRef;
    } else {
      // Get reference to existing document
      docRef = firestore3
        .collection("whatsappInsuranceOrders")
        .doc(userContext.insuranceDocId);
    }

    // 6. Update Firestore with document URL based on type
    const updateData = {};
    
    switch (expectedDocumentType) {
      case "nationalId":
        updateData.nationalIdDocumentUrl = publicUrl;
        break;
      case "yellowCard":
        updateData.yellowCardDocumentUrl = publicUrl;
        break;
      case "carImage":
        updateData.carImageUrl = publicUrl;
        break;
      case "nationalId_rw":
        updateData.nationalIdDocumentUrl = publicUrl;
        break;
      case "yellowCard_rw":
        updateData.yellowCardDocumentUrl = publicUrl;
        break;
      case "carImage_rw":
        updateData.carImageUrl = publicUrl;
        break;
      
      default:
        updateData.insuranceDocumentUrl = publicUrl;
    }
    
    await docRef.update(updateData);
    console.log(`Updated Firestore with ${expectedDocumentType} document URL`);

    // 7. Extract data from the document
    try {
      const extractionResponse = await axios.post(
        "https://assigurwmessaging.onrender.com/extract-data",
        {
          imageUrl: publicUrl,
          documentType: expectedDocumentType
        }
      );
      
      console.log(`${expectedDocumentType} data extraction response:`, extractionResponse.data);
      
      if (extractionResponse.data.success) {
        const rawResponse = extractionResponse.data.data.raw_response;
        console.log("Raw response before parsing:", rawResponse);

        let extractedData;
        try {
          const jsonString = rawResponse.replace(/```json\n|\n```/g, "").trim();
          console.log("Cleaned JSON string:", jsonString);
          extractedData = JSON.parse(jsonString);
          
          // Check validity based on document type
          let isValidDocument = false;
          
          switch (expectedDocumentType) {
            case "nationalId":
              //isValidDocument = extractedData.Names && extractedData.National_Id_No;
              isValidDocument = extractedData["Amazina/Names"] && extractedData["Indangamuntu/National Id No"];
              break;
              
            case "yellowCard":
              isValidDocument = extractedData["N0 Immatriculation"] && extractedData["Nom"]; //extractedData.N0_Immatriculation && extractedData.Nom;
              break;
              
            case "insurance":
              isValidDocument = extractedData.policyholder_name && 
                               extractedData.chassis && 
                               extractedData.insurer;
              break;
              
            case "carImage":
              isValidDocument = extractedData.body_type;
              break;
              
            case "nationalId_rw":
              //isValidDocument = extractedData.Names && extractedData.National_Id_No;
              isValidDocument = extractedData["Amazina/Names"] && extractedData["Indangamuntu/National Id No"];
              break;
              
            case "yellowCard_rw":
              isValidDocument = extractedData["N0 Immatriculation"] && extractedData["Nom"]; //extractedData.N0_Immatriculation && extractedData.Nom;
              break;
              
            case "insurance_rw":
              isValidDocument = extractedData.policyholder_name && 
                               extractedData.chassis && 
                               extractedData.insurer;
              break;
              
            case "carImage_rw":
              isValidDocument = extractedData.body_type;
              break;
          }
          
          if (!isValidDocument) {
            // Invalid document - ask for upload again
            await sendWhatsAppMessage(
              phone,
              {
                type: "text",
                text: {
                  body: `*Suzuma neza*\nBisa n’aho icyangombwa wohereje kitari mu buryo bukwiriye. Reba neza niba ari cyo ubundi wongere wohereze.`,
                },
              },
              phoneNumberId
            );
            userContext.stage = "EXPECTING_DOCUMENT";
            userContext.expectingDocumentType = expectedDocumentType;
            userContexts.set(phone, userContext);
            return;
          }
          
          // Process specific document types
          if (expectedDocumentType === "nationalId" || expectedDocumentType === "nationalId_rw") {
            // Save national ID data
            await docRef.update({
              nationalIdNames: extractedData["Amazina/Names"] || "",
              nationalIdNumber: extractedData["Indangamuntu/National Id No"] || ""
            });
            
            userContext.nationalIdNames = extractedData["Amazina/Names"];
            userContext.nationalIdNumber = extractedData["Indangamuntu/National Id No"];
            
          } else if (expectedDocumentType === "yellowCard" || expectedDocumentType === "yellowCard_rw") {
            // Save yellow card data with correct property names
  await docRef.update({
    yellowCardImmatriculation: extractedData["N0 Immatriculation"] || "",
    yellowCardGenre: extractedData["Genre"] || "",
    yellowCardMarque: extractedData["Marque"] || "",
    yellowCardChassis: extractedData["N0 Du Chassis"] || "",
    yellowCardAnnee: extractedData["Annee"] || "",
    yellowCardDate: extractedData["Date"] || "",
    yellowCardTin: extractedData["Tin"] || "",
    yellowCardNom: extractedData["Nom"] || ""
  });
  
  userContext.yellowCardImmatriculation = extractedData["N0 Immatriculation"];
  userContext.yellowCardNom = extractedData["Nom"];
            
          } else if (expectedDocumentType === "insurance" || expectedDocumentType === "insurance_rw") {
            // Save insurance data (similar to original code)
            const {
              policyholder_name: policyholderName = "",
              policy_no: policyNo = "",
              //inception_date: insuranceStartDate = "",
              expiry_date: expiryDate = "",
              mark_and_type: markAndType = "",
              registration_plate_no: plateNumber = "",
              chassis = "",
              licensed_to_carry_no: licensedToCarryNo = "",
              usage = "",
              insurer = "",
            } = extractedData;
            
            await docRef.update({
            //  insuranceStartDate,
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
            
            userContext.formattedPlate = plateNumber;
            userContext.licensedToCarryNumber = licensedToCarryNo;
            userContext.markAndTypeValue = markAndType;
          } else if (expectedDocumentType === "carImage" || expectedDocumentType === "carImage_rw") {
            // Save car body type data
            await docRef.update({
              carBodyType: extractedData.body_type || ""
            });
            
            userContext.carBodyType = extractedData.body_type;
          }
          
        } catch (parseError) {
          console.error("JSON parsing error:", parseError);
          // Send message to user about invalid document
          await sendWhatsAppMessage(
            phone,
            {
              type: "text",
              text: {
                body: `The uploaded ${expectedDocumentType} document appears to be invalid. Please ensure it's clear and readable, then upload again.`,
              },
            },
            phoneNumberId
          );
          userContext.stage = "EXPECTING_DOCUMENT";
          userContext.expectingDocumentType = expectedDocumentType;
          userContexts.set(phone, userContext);
          return;
        }
      }
    } catch (extractionError) {
      console.error(`${expectedDocumentType} data extraction error:`, extractionError);
    }

    // 8. Determine next step in flow based on document type
    
    // Clear current document expectation
    userContext.stage = null;
    userContext.expectingDocumentType = null;
    
    // Determine next document to request or next step in flow
    if (expectedDocumentType === "nationalId") {
      // After national ID, request insurance document
      await requestInsuranceDocument(phone, phoneNumberId);
    } else if (expectedDocumentType === "insurance") {
      // After insurance, request yellow card
      await requestYellowCard(phone, phoneNumberId);
    } else if (expectedDocumentType === "yellowCard") {
      // After yellow card, request car image
      await requestCarImage(phone, phoneNumberId);
    } else if (expectedDocumentType === "carImage") {
      // After car image, proceed with insurance flow
      await stateInsuranceDuration(
        phone,
        userContext.formattedPlate,
        phoneNumberId
      );
    } else if (expectedDocumentType === "nationalId_rw") {
      // After national ID, request insurance document
      await requestInsuranceDocumentRW(phone, phoneNumberId);
    } else if (expectedDocumentType === "insurance_rw") {
      // After insurance, request yellow card
      await requestYellowCardRW(phone, phoneNumberId);
    } else if (expectedDocumentType === "yellowCard_rw") {
      // After yellow card, request car image
      await requestCarImageRW(phone, phoneNumberId);
    } else if (expectedDocumentType === "carImage_rw") {
      // After car image, proceed with insurance flow
      await stateInsuranceDurationRW(
        phone,
        userContext.formattedPlate,
        phoneNumberId
      );
    }
    
    userContexts.set(phone, userContext);
    
  } catch (error) {
    console.error(`Error processing ${expectedDocumentType} document:`, error);
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





// 1. Modified extraction function that can handle different document types
async function extractImageData(imageUrl, documentType) {
  try {
    const base64Image = await getBase64FromUrl(imageUrl);
    
    // Define extraction prompt based on document type
    let extractionPrompt = "";
    
    switch (documentType) {
      case "insurance":
        extractionPrompt = "Extract the following details, policyholder name, policy no, inception date, expiry date, mark & type, registation plate no, chassis, licensed to carry no, usage, insurer. Return these details in JSON format.";
        break;
      case "nationalId":
        extractionPrompt = "Extract the following details from this national ID document: Amazina/Names, Indangamuntu/National Id No. Return these details in JSON format.";
        break;
      case "yellowCard":
        extractionPrompt = "Extract the following details from this yellow card document: N0 Immatriculation, genre, Marque, N0 Du chassis, Annee, Date, Tin, Nom. Return these details in JSON format.";
        break;
      case "carImage":
        extractionPrompt = "This is a car image. Identify the body type/style of the car in this image. Options include sedan, hatchback, SUV, pickup truck, coupe, convertible, wagon, van, minivan, or other specialized types. Return only the body type in JSON format with key 'body_type'.";
        break;
      case "insurance_rw":
        extractionPrompt = "Extract the following details, policyholder name, policy no, inception date, expiry date, mark & type, registation plate no, chassis, licensed to carry no, usage, insurer. Return these details in JSON format.";
        break;
      case "nationalId_rw":
        extractionPrompt = "Extract the following details from this national ID document: Amazina/Names, Indangamuntu/National Id No. Return these details in JSON format.";
        break;
      case "yellowCard_rw":
        extractionPrompt = "Extract the following details from this yellow card document: N0 Immatriculation, genre, Marque, N0 Du chassis, Annee, Date, Tin, Nom. Return these details in JSON format.";
        break;
      case "carImage_rw":
        extractionPrompt = "This is a car image. Identify the body type/style of the car in this image. Options include sedan, hatchback, SUV, pickup truck, coupe, convertible, wagon, van, minivan, or other specialized types. Return only the body type in JSON format with key 'body_type'.";
        break;
      default:
        extractionPrompt = "Extract all visible text from this document and return in JSON format.";
    }

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
                text: extractionPrompt,
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

// 2. Updated endpoint to handle document type
app.post("/extract-data", async (req, res) => {
  try {
    const { imageUrl, documentType = "insurance" } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    const extractedData = await extractImageData(imageUrl, documentType);
    console.log(`Extracted ${documentType} data:`, extractedData);
    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to extract data",
    });
  }
});

// handle document upload
const handleDocumentUploadDraft2 = async (message, phone, phoneNumberId) => {
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
    !(mediaMimeType.startsWith("image/"))
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
    //const realCreationDate2 = new admin.firestore.Timestamp.fromDate(formattedDate);

    const insuranceData = {
      userPhone: phone,
      insuranceDocumentUrl: publicUrl, // Store the storage URL
      creationDate: admin.firestore.Timestamp.now(),
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
        "https://assigurwmessaging.onrender.com/extract-data",
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

async function extractImageDataOld(imageUrl) {
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

app.post("/extract-data-old", async (req, res) => {
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
      // Note: You don't need to redefine userContext here as it's already defined above
      
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

      // Update user context
      userContext.stage = "EXPECTING_DROPOFF_ADDRESS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_DROPOFF_ADDRESS") {
      userContext.dropoffAddress = location.address || "";
      userContext.dropoffLatitude = location.latitude;
      userContext.dropoffLongitude = location.longitude;

      // Use the calendar message template
      const calendarMessageOld = {
        type: "interactive",
        interactive: {
          type: "flow",
          body: {
            text: "When would you like to be picked up?"
          },
          flow: {
            id: "1355403968945372" // Your flow ID
          }
        }
      };

      const calendarMessage = {
    type: "template",
    template: {
      name: "calendarmessage", 
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
              payload: "1355403968945372", 
            },
          ],
        },
      ],
    },
  };

      await sendWhatsAppMessage(phone, calendarMessage, phoneNumberId);

      // Update user context
      userContext.stage = "EXPECTING_DATETIME_SELECTION";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_PICKUP_ADDRESS_GOODS") {
      // Note: You don't need to redefine userContext here
      
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
      // Note: You don't need to redefine userContext here
      
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
              // You've commented out the "Later" option
            ],
          },
        },
      };

      await sendWhatsAppMessage(phone, requestTimePayload, phoneNumberId);

      userContext.stage = "EXPECTING_NOW_LATER_GOODS";
      userContexts.set(phone, userContext);
    } else if (userContext.stage === "EXPECTING_PICKUP_ADDRESS_QUICKRIDES") {
      // Note: You don't need to redefine userContext here
      
      userContext.pickupAddress = location.address || "";
      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;

      await sendAvailableDriversMessage(phone, phoneNumberId); 
      userContexts.set(phone, userContext);
    } else {
      console.log("Not the correct stage");
    }

    console.log("Location updated and order saved successfully.");
  } catch (error) {
    console.error("Error processing location and saving order:", error);
    
    // Fix for the error message - handle the case where error might not be an object with a message property
    const errorMessage = error && error.message ? error.message : "Unknown error";
    
    await sendWhatsAppMessage(
      phone,
      {
        type: "text",
        text: {
          body: `Sorry, there was an error processing your location. Please try again.`,
        },
      },
      phoneNumberId
    );
  }
};

const handleLocationOld = async (location, phone, phoneNumberId) => {
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

      // Use the calendar message template instead of requestTimePayload
  const calendarMessage = {
    type: "interactive",
    interactive: {
      type: "flow",
      body: {
        text: "When would you like to be picked up?"
      },
      flow: {
        id: "1355403968945372" // Your flow ID
      }
    }
  };

  await sendWhatsAppMessage(phone, calendarMessage, phoneNumberId);

  // Update user context
  userContext.stage = "EXPECTING_DATETIME_SELECTION";
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
    }  else if (userContext.stage === "EXPECTING_PICKUP_ADDRESS_QUICKRIDES") {
      // Retrieve the order from userContext
      const userContext = userContexts.get(phone) || {};

      userContext.pickupAddress = location.address || "";
      userContext.pickupLatitude = location.latitude;
      userContext.pickupLongitude = location.longitude;

     await sendAvailableDriversMessage(phone, phoneNumberId); 
      //await sendWhatsAppMessage(phone, locationRequestPayload, phoneNumberId);

      //userContext.stage = "EXPECTING_DROPOFF_ADDRESS_GOODS";
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
      case "order":
            await handleOrder(message, changes, changes.value.metadata.display_phone_number, phoneNumberId);
            break;
      
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
      } else if (message.interactive.type === "flow_response") {
    // This handles the calendar flow response
    const userContext = userContexts.get(phone) || {};
    
    if (userContext.stage === "EXPECTING_DATETIME_SELECTION") {
          const flowData = message.interactive.flow_response.data;
          const selectedDate = flowData.screen_0_Date_0;
          const selectedTime = flowData.screen_0_Time_1;

          userContext.pickupDate = selectedDate;
          userContext.pickupTime = selectedTime;
          userContexts.set(phone, userContext);

          // Send available drivers message
          await sendAvailableDriversMessage(phone, phoneNumberId);
          return;
        }
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
        text: "Welcome to Lifuti App!",
      },
      body: {
        text: "What do you want to do today?",
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
                id: "quickrides",
                title: "See nearby drivers",
                description: "Passenger(s)(Taxi/Cab)",
              },
              {
                id: "passenger",
                title: "Book a ride",
                description: "Schedule a journey",
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
      //userContext.stage = "EXPECTING_SEATS";
      //userContexts.set(phone, userContext);

      // Proceed to seat selection
      //await sendSeatSelectionMessage(phone, phoneNumberId);
      await sendAvailableDriversMessage(phone, phoneNumberId);
        userContext.seats = "0";
        userContexts.set(phone, userContext);
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



// Function to request National ID (starting point in the flow)
async function requestNationalId(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*National ID*\nPlease upload a clear image(only image) of your National ID document.`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "nationalId";
  userContexts.set(phone, userContext);
}

// Function to request insurance document (second in flow)
async function requestInsuranceDocument(phone, phoneNumberId) {
  

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `*Insurance Certificate*\nThank you for your National ID. Now, please upload a clear image(only image) of your current or old insurance certificate.`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "no_insurance_document",
              title: "Not available"
            }
          }
          
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "insurance";
  userContexts.set(phone, userContext);
}

// Function to request Yellow Card 
async function requestYellowCard(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Yellow Card*\nThank you for your insurance certificate. Now, please upload a clear image(only image) of your Yellow Card.`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "yellowCard";
  userContexts.set(phone, userContext);
}


async function requestCarImage(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Car Photo*\nThank you for your Yellow Card. Finally, please upload a clear image of your car so we can determine its body type (sedan, pickup, SUV, etc.).`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  // Update user context to expect a document
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "carImage";
  userContexts.set(phone, userContext);
}

// Get insurance document
async function requestInsuranceDocumentOld(phone, phoneNumberId) {
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
        text: "Select Vehicle Type"
      },
      body: {
        text: "Choose your vehicle type and purpose from the options below:"
      },
      action: {
        button: "Select Vehicle",
        sections: [
          {
            title: "Motorcycles & Cars",
            rows: [
              {
                id: "side_cars_motor_bikes_commercial",
                title: "Motorcycle/Tricycle",
                description: "Commercial/Transport of Goods"
              },
              {
                id: "car_voiture",
                title: "Car/Voiture - Private",
                description: "Sedan/Saloon for private use"
              },
              {
                id: "car_voiture_taxi",
                title: "Car/Voiture - Taxi",
                description: "Sedan/Saloon for taxi service"
              },
              {
                id: "car_voiture_commercial",
                title: "Car/Voiture - For Hire",
                description: "Sedan/Saloon for hire service"
              },
              {
                id: "car_voiture_goods",
                title: "Car/Voiture - Commercial",
                description: "Sedan/Saloon for transport of goods"
              }
            ]
          },
          {
            title: "SUVs & Vans",
            rows: [
              {
                id: "jeep_suv",
                title: "Jeep/SUV - Private",
                description: "SUV for private use"
              },
              {
                id: "jeep_suv_taxi",
                title: "Jeep/SUV - Taxi",
                description: "SUV for taxi service"
              },
              {
                id: "jeep_suv_commercial",
                title: "Jeep/SUV - For Hire",
                description: "SUV for hire service"
              },
              {
                id: "jeep_suv_goods",
                title: "Jeep/SUV - Commercial",
                description: "SUV for transport of goods"
              },
              {
                id: "minibus_van",
                title: "Minibus/Van - Private",
                description: "For private use"
              }
            ]
          }
         
          
        ]
      }
    }
  };

  const payload2 = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Extra Vehicle Type"
      },
      body: {
        text: "Choose your vehicle type and purpose from the options below:"
      },
      action: {
        button: "More Vehicles",
        sections: [
         
          {
            title: "Commercial Vehicles",
            rows: [
              {
                id: "minibus_van_taxi",
                title: "Minibus/Van - Taxi",
                description: "For taxi service"
              },
              {
                id: "minibus_van_commercial",
                title: "Minibus/Van - For Hire",
                description: "For hire service"
              },
              {
                id: "minibus_van_goods",
                title: "Minibus/Van - Commercial",
                description: "For transport of goods"
              },
              {
                id: "pickup",
                title: "Pickup/Camion. Private",
                description: "For private use/Cammionnette"
              },
              {
                id: "pickup_commercial",
                title: "Pickup/Camion. For Hire",
                description: "For hire service/Camionnette"
              }
            ]
          },
          {
            title: "Heavy Vehicles",
            rows: [
              {
                id: "pickup_goods",
                title: "Pickup/Camion.Commercial",
                description: "For transport of goods/Camionnette"
              },
              {
                id: "trailer_semi_trailer_goods",
                title: "Truck/Camion Commercial",
                description: "For transport of goods (Non-Flammable)"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  await sendWhatsAppMessage(phone, payload2, phoneNumberId);
}

// draft
async function selectVehicleBodyTypeDraft(phone, phoneNumberId) {
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



// Function to give notice to the customer about the proforma
async function noticeProforma(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Bear with us a little*\nWe're verifying and generating the proforma.`,
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
    userContext.usageTypeManual,
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
    const netPremium = baseAmount; //+ occupantFee + comesaMedicalFee;
    const adminFee = isComesa ? 10000 : 2500; // Yellow card fee for COMESA
    const vat = Math.round((netPremium + adminFee) * 0.18);
    const sgf = Math.round(netPremium * 0.1);
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

// Create the detailed breakdown text with properly aligned values ${' '.repeat(longestLabelLength - 'Type of Cover'.length)} //Occupant: ${formatNumber(userContext.licensedToCarryNumber)} COMESA Medical Fee: ${formatNumber(breakdown.comesaMedicalFee)}
const breakdownText = `Insurance Premium Breakdown:

Type of Cover: ${userContext.coverType}
TPL: ${formatNumber(breakdown.tpl)}
NET PREMIUM: ${formatNumber(breakdown.netPremium)}
Adm.fee/Yellow Card: ${formatNumber(breakdown.adminFee)}
VAT(18%): ${formatNumber(breakdown.vat)}
SGF: ${formatNumber(breakdown.sgf)}
TOTAL PREMIUM: ${formatNumber(breakdown.total)}

TOTAL TO PAY: ${formatNumber(breakdown.total)}

Please select your preferred payment plan:`;
  
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Choose Payment Plan",
      },
      body: {
        text: "Please select your preferred payment plan:" //breakdownText,
      },
      action: {
        button: "Select Installments",
        sections: [
          {
            title: "Installments",
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
  //const realCreationDate = new admin.firestore.Timestamp.fromDate(todayFirebase);
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
  //  insuranceStartDate: userContext.insuranceStartDate
  //    ? String(userContext.insuranceStartDate)
  //    : "",
  //  insuranceEndDate: userContext.insuranceEndDate
  //    ? String(userContext.insuranceEndDate)
  //    : "",
   // selectedCoverTypes: userContext.selectedCoverTypes
   //   ? String(userContext.selectedCoverTypes)
   //   : "",
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
    creationDate: admin.firestore.Timestamp.now(), //formattedDateFirebase,
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
    // const orderDocRef = await firestore3
    //  .collection("whatsappInsuranceOrders")
    //  .add(insuranceOrderData);
    userContext.insuranceDocRef.update(insuranceOrderData);
    console.log(
      "Insurance order data successfully saved to Firestore with ID:",
      orderDocRef.id
    );
    
    // Update context with the new document ID
    //userContext.insuranceDocId = orderDocRef.id;
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
    await userContext.insuranceDocRef.update({
      quotationId: quotationDocRef.id
    });

  } catch (error) {
    console.error("Error saving data to Firestore:", error.message);
  }

  // Add logic to integrate with payment gateway API if needed.
  console.log("______________________________________");
  console.log("User context after all flows:", userContext);
}


// Kinyarwanda flows
// ---------- RW versions of Insurance Services Functions ----------

// Initial welcome message – RW
async function sendWelcomeMessageRW(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "WELCOME"; // keeping the same stage value
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Ikaze!"
      },
      body: {
        text: "Murakaza neza! Fata ubwishingizi bw'imodoka yawe mu buryo bwihuse kandi bw’ikoranabuhanga. Kanda ‘Tangira’ maze dutangire urugendo rwacu hamwe!"
      },
      footer: {
        text: "Hitamo igikorwa cyo gukomeza"
      },
      action: {
        button: "Tangira",
        sections: [
          {
            title: "Serivisi z'Ubwishingizi",
            rows: [
              {
                id: "get_insurance_rw",
                title: "Fata Ubwishingizi",
                description: "Saba ubwishingizi bushya"
              }
              // Additional options can be added here.
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Claim Filing Process – RW
async function initiateClaimProcessRW(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Gutanga Ikirego"
      },
      body: {
        text: "Tegura inyandiko zikurikira ku kirego cyawe:"
      },
      action: {
        button: "Ongeraho Inyandiko",
        sections: [
          {
            title: "Inyandiko Zikenewe",
            rows: [
              {
                id: "add_driver_license",
                title: "Indangamuntu y'Umushoferi",
                description: "Ohereza amakuru y'indangamuntu y'umushoferi"
              },
              {
                id: "add_logbook",
                title: "Igitabo cy'Ikinyabiziga",
                description: "Ohereza inyandiko y'iyandikwa ry'ikinyabiziga"
              },
              {
                id: "add_insurance_cert",
                title: "Icyemezo cy'Ubwishingizi",
                description: "Ohereza inyandiko y'ubwishingizi buhari"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Request National ID – RW
async function requestNationalIdRW(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Twohereze Indangamuntu*\nOk! Noneho, ohereza ifoto y'indangamuntu(ifoto gusa) ya nyiri iki kinyabiziga. Ibi bidufasha kwemeza amakuru yawe byihuse.`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "nationalId_rw";
  userContexts.set(phone, userContext);
}

// Request Insurance Document – RW
async function requestInsuranceDocumentRW(phone, phoneNumberId) {
  
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `*Icyemezo cy'Ubwishingizi Gisanzwe(Niba gihari)*\nNiba ufite icyemezo cy'ubwishingizi gisanzwe, twohereze ifoto(ifoto gusa). Niba utagifite, kanda kuri 'Ntacyo' maze dukomeze.`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "no_insurance_document_rw",
              title: "Ntacyo"
            }
          }
          
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "insurance_rw";
  userContexts.set(phone, userContext);
}

// Request Yellow Card – RW
async function requestYellowCardRW(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Carte Jaune(Yellow Card)/Logbook*\nDukomeze! Ubu noneho twohereze ifoto(ifoto gusa) ya Carte Jaune(Yellow Card)/Logbook y'ikinyabiziga kugirango tumenye neza amakuru y'imodoka.`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "yellowCard_rw";
  userContexts.set(phone, userContext);
}

// Request Car Image – RW
async function requestCarImageRW(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Ifoto y'Imodoka*\nTuri hafi gusoza gutanga ibyemezo by'ibanze! Noneho, ohereza ifoto y'imodoka wifuza gufatira ubwishingizi.`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_DOCUMENT";
  userContext.expectingDocumentType = "carImage_rw";
  userContexts.set(phone, userContext);
}

// Request Vehicle Plate Number – RW
async function requestVehiclePlateNumberRW(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: "Nyamuneka tanga nimero y'ikarita y'ikinyabiziga cyawe (nko: RAD 123A):"
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// State Insurance Duration – RW
async function stateInsuranceDurationRW(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_STATE_INSURANCE_DURATION";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `*Nimero y'Ikinyabiziga:*\n${plateNumber}\n\nUbwishingizi bwawe buzamara igihe kingana gite?`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "full_year_rw",
              title: "Umwaka Wose"
            }
          },
          {
            type: "reply",
            reply: {
              id: "less_than_a_year_rw",
              title: "Munsi y'Umwaka"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Start Date – RW
async function startDateRW(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_START_DATE_RW";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `*Ni Ryari Ubwishingizi Buzatangira?*\nAndika itariki ushakako ubwishingizi buzatangira. (Urugero: DD/MM/YYYY, 02/01/2100)`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// End Date – RW
async function endDateRW(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_END_DATE_RW";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: `*Itariki yo Gusoza*\nNoneho andika itariki ushakako ubwishingizi buzarangira. (Urugero: DD/MM/YYYY, 04/01/2025)`
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Period Selection – RW
async function selectInsurancePeriodRW(phone, plateNumber, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.plateNumber = plateNumber;
  userContext.stage = "EXPECTING_INSURANCE_PERIOD";
  userContexts.set(phone, userContext);

  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Nimero y'Ikinyabiziga: ${plateNumber}\n\nUbwishingizi bwawe buzatangira ryari?`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "start_today_rw",
              title: "Tangirira Uyu Munsi"
            }
          },
          {
            type: "reply",
            reply: {
              id: "custom_date_rw",
              title: "Hitamo Itariki"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Insurance Cover Type Selection – RW
async function selectInsuranceCoverTypeRW(phone, phoneNumberId) {
  // Here we use an interactive message (instead of a template) with Kinyarwanda text.
const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Hitamo Ubwoko bw'Ubwishingizi",
      },
      body: {
        text: "Waba ushaka guhitamo ubwoko bw'ubwishingizi?",
      },
  
      action: {
        button: "Reba Ubwishingizi",
        sections: [
          {
            title: "Third Party",
            rows: [
              {
                id: "third_party_rw",
                title: "Third Party Cover",
                description: "Motor Insurance",
              },
              
            ],
          },
        ],
      },
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}


// Select to Add Personal Accident Cover – RW
// (Keep text in English as instructed)
async function selectToAddPersonalAccidentCoverRW(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: `Waba wifuza gufata ubwirinzi bwa accident bwawe/ku mugenzi?`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "add_yes",
              title: "Yes"
            }
          },
          {
            type: "reply",
            reply: {
              id: "add_no",
              title: "No"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

  const userContext = userContexts.get(phone) || {};
  userContext.stage = "PERSONAL_ACCIDENT_COVER";
  userContexts.set(phone, userContext);
}

// Personal Accident Cover Categories – RW
// (Keep text in English as instructed)
async function selectPersonalAccidentCategoryRW(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Personal Accident Cover Categories"
      },
      body: {
        text: "Based on coverage levels:"
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
                  "Death/Disability: FRW 1,000,000 | Medical: FRW 100,000"
              },
              {
                id: "cat_2",
                title: "CAT 2",
                description:
                  "Death/Disability: FRW 2,000,000 | Medical: FRW 200,000"
              },
              {
                id: "cat_3",
                title: "CAT 3",
                description:
                  "Death/Disability: FRW 3,000,000 | Medical: FRW 300,000"
              },
              {
                id: "cat_4",
                title: "CAT 4",
                description:
                  "Death/Disability: FRW 4,000,000 | Medical: FRW 400,000"
              },
              {
                id: "cat_5",
                title: "CAT 5",
                description:
                  "Death/Disability: FRW 5,000,000 | Medical: FRW 500,000"
              },
              {
                id: "risk_taker",
                title: "No Cover",
                description: "I'm a risk taker!"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Number of Covered People – RW
async function numberOfCoveredPeopleRW(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.stage = "EXPECTING_NUMBER_OF_PEOPLE";
  userContexts.set(phone, userContext);

  const payload = {
    type: "text",
    text: {
      body: "Ni abantu bangahe bazarindwa? (Urugero: 1, 4, etc):"
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Select Vehicle Body Type – RW
async function selectVehicleBodyTypeRW(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Hitamo ubwoko bw'imodoka"
      },
      body: {
        text: "Hitamo ubwoko bw'ikinyabiziga cyawe n'intego yabyo mu mahitamo akurikira:"
      },
      action: {
        button: "Hitamo Imodoka",
        sections: [
          {
            title: "Moto n'Imodoka",
            rows: [
              {
                id: "side_cars_motor_bikes_commercial",
                title: "Moto/Tricycle",
                description: "Ikoreshwa mu bucuruzi/Itwara ibicuruzwa"
              },
              {
                id: "car_voiture",
                title: "Imodoka - Ku giti cyawe",
                description: "Sedan/Saloon ikoreshwa ku giti cyawe"
              },
              {
                id: "car_voiture_taxi",
                title: "Imodoka - Taxi",
                description: "Sedan/Saloon ikoreshwa nka taxi"
              },
              {
                id: "car_voiture_commercial",
                title: "Imodoka - Gukodesha",
                description: "Sedan/Saloon ikoreshwa mu gukodesha"
              },
              {
                id: "car_voiture_goods",
                title: "Imodoka - Ubucuruzi",
                description: "Sedan/Saloon ikoreshwa mu gutwara ibicuruzwa"
              }
            ]
          },
          {
            title: "SUVs & Vans",
            rows: [
              {
                id: "jeep_suv",
                title: "Jeep/SUV - Ku giti cyawe",
                description: "SUV ikoreshwa ku giti cyawe"
              },
              {
                id: "jeep_suv_taxi",
                title: "Jeep/SUV - Taxi",
                description: "SUV ikoreshwa nka taxi"
              },
              {
                id: "jeep_suv_commercial",
                title: "Jeep/SUV - Gukodesha",
                description: "SUV ikoreshwa mu gukodesha"
              },
              {
                id: "jeep_suv_goods",
                title: "Jeep/SUV - Ubucuruzi",
                description: "SUV ikoreshwa mu gutwara ibicuruzwa"
              },
              {
                id: "minibus_van",
                title: "Minibus/Van - Ku giti cyawe",
                description: "Ku giti cyawe"
              }
            ]
          }
        ]
      }
    }
  };

  const payload2 = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Ubwoko bw'inyongera bw'imodoka"
      },
      body: {
        text: "Hitamo ubwoko bw'ikinyabiziga cyawe n'intego yabyo mu mahitamo akurikira:"
      },
      action: {
        button: "Izindi Modoka",
        sections: [
          {
            title: "Imodoka z'ubucuruzi",
            rows: [
              {
                id: "minibus_van_taxi",
                title: "Minibus/Van - Taxi",
                description: "Ikoreshwa nka taxi"
              },
              {
                id: "minibus_van_commercial",
                title: "Minibus/Van - Gukodesha",
                description: "Ikoreshwa mu gukodesha"
              },
              {
                id: "minibus_van_goods",
                title: "Minibus/Van - Ubucuruzi",
                description: "Ikoreshwa mu gutwara ibicuruzwa"
              },
              {
                id: "pickup",
                title: "Pickup/Camion. Ku giti cyawe",
                description: "Ikoreshwa ku giti cyawe/Camionnette"
              },
              {
                id: "pickup_commercial",
                title: "Pickup/Camion. Gukodesha",
                description: "Ikoreshwa mu gukodesha/Camionnette"
              }
            ]
          },
          {
            title: "Ibinyabiziga Binini",
            rows: [
              {
                id: "pickup_goods",
                title: "Pickup/Camion. Ubucuruzi",
                description: "Ikoreshwa mu gutwara ibicuruzwa/Camionnette"
              },
              {
                id: "trailer_semi_trailer_goods",
                title: "Truck/Camion Ubucuruzi",
                description: "Ikoreshwa mu gutwara ibicuruzwa (Idashya)"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  await sendWhatsAppMessage(phone, payload2, phoneNumberId);
}

// Select Vehicle Body Type Draft – RW
async function selectVehicleBodyTypeDraftRW(phone, phoneNumberId) {
  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Hitamo ubwoko bw'imiterere y'imodoka"
      },
      body: {
        text: "Hitamo ubwoko bw'imiterere y'imodoka yawe mu mahitamo akurikira:"
      },
      action: {
        button: "Hitamo Imiterere",
        sections: [
          {
            title: "Ubwoko bw'imiterere",
            rows: [
              {
                id: "side_cars_motor_bikes",
                title: "Ibinyabiziga bito byoroshye",
                description: "Side Cars & Motor Bikes, Tricycles"
              },
              {
                id: "car_voiture",
                title: "Imodoka",
                description: "Imodoka zisanzwe z'abagenzi."
              },
              {
                id: "jeep_suv",
                title: "Jeep/SUV",
                description: "Imodoka za Sport Utility."
              },
              {
                id: "pickup",
                title: "Pickup/Camionnette ntoya (<5TN)",
                description: "Pickup/Camionnette (imyanya mito)"
              },
              {
                id: "minibus_van",
                title: "Minibus/Van",
                description: "Minibus na van z'abagenzi benshi."
              },
              {
                id: "school_bus",
                title: "Bisi y'Amashuri",
                description: "Bisi ikoreshwa mu gutwara abanyeshuri."
              },
              {
                id: "bus",
                title: "Bisi",
                description: "Bisi nini z'abagenzi."
              },
              {
                id: "trailer_semi_trailer",
                title: "Trailer & Semi-Trailer",
                description: "Trailer (Remorque) & Semi-Trailer (Semi-Remorque)"
              },
              {
                id: "howo_shacman_fuso_faw",
                title: "Amatiraki akomeye",
                description: "HOWO, SHACMAN, FUSO, FAW"
              },
              {
                id: "truck_tractor_lorry",
                title: "Camion n'Imashini zikomeye",
                description: "Truck (Camion) & Tractor, Lorry>= 5 TN – Camionnette"
              }
            ]
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
}

// Function to give notice to the customer about the proforma
async function noticeProformaRW(phone, phoneNumberId) {
  const payload = {
    type: "text",
    text: {
      body: `*Turi gutegura proforma y'ubwishingizi*\nMurakoze! Mutegereze gato, turi gutegura proforma y'ubwishingizi turayohereza mu kanya gato.`,
    },
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);

}


// Select Payment Plan – RW
// (Keep the premium summary and installment options in English)
async function selectPaymentPlanRW(phone, phoneNumberId) {
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
    userContext.usageTypeManual,
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
    const netPremium = baseAmount; //+ occupantFee + comesaMedicalFee;
    const adminFee = isComesa ? 10000 : 2500; // Yellow card fee for COMESA
    const vat = Math.round((netPremium + adminFee) * 0.18);
    const sgf = Math.round(netPremium * 0.1);
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

// Create the detailed breakdown text with properly aligned values ${' '.repeat(longestLabelLength - 'Type of Cover'.length)} //Occupant: ${formatNumber(userContext.licensedToCarryNumber)} COMESA Medical Fee: ${formatNumber(breakdown.comesaMedicalFee)}
const breakdownText = `Insurance Premium Breakdown:

Type of Cover: ${userContext.coverType}
TPL: ${formatNumber(breakdown.tpl)}
NET PREMIUM: ${formatNumber(breakdown.netPremium)}
Adm.fee/Yellow Card: ${formatNumber(breakdown.adminFee)}
VAT(18%): ${formatNumber(breakdown.vat)}
SGF: ${formatNumber(breakdown.sgf)}
TOTAL PREMIUM: ${formatNumber(breakdown.total)}

TOTAL TO PAY: ${formatNumber(breakdown.total)}

Please select your preferred payment plan:`;

  const payload = {
    type: "interactive",
    interactive: {
      type: "list",
      header: {
        type: "text",
        text: "Hitamo Uburyo Bwo Kwishyura" //"Premium Summary"
      },
      body: {
        text: "Please select your preferred payment plan:" //breakdownText
      },
      action: {
        button: "Reba installments",
        sections: [
          {
            title: "Installments",
            rows: [
              {
                id: "installment_cat1_rw",
                title: "CAT 1 Installment",
                description: `1M (${formatNumber(Math.round(breakdown.total * 0.25))}), 2M (${formatNumber(Math.round(breakdown.total * 0.25))}), 9M (${formatNumber(Math.round(breakdown.total * 0.5))})`
              },
              {
                id: "installment_cat2_rw",
                title: "CAT 2 Installment",
                description: `3M (${formatNumber(Math.round(breakdown.total * 0.5))}), 9M (${formatNumber(Math.round(breakdown.total * 0.5))})`
              },
              {
                id: "installment_cat3_rw",
                title: "CAT 3 Installment",
                description: `6M (${formatNumber(Math.round(breakdown.total * 0.75))}), 6M (${formatNumber(Math.round(breakdown.total * 0.25))})`
              },
              {
                id: "installment_cat4_rw",
                title: "CAT 4 Installment",
                description: `1M (${formatNumber(Math.round(breakdown.total * 0.25))}), 3M (${formatNumber(Math.round(breakdown.total * 0.35))}), 8M (${formatNumber(Math.round(breakdown.total * 0.4))})`
              },
              {
                id: "full_payment_rw",
                title: "Full Payment",
                description: `Pay ${formatNumber(breakdown.total)} upfront`
              }
            ]
          }
        ]
      }
    }
  };

  // Save calculated values and update Firestore as in the original function...
  userContext.calculatedTotal = breakdown.total;
  userContexts.set(phone, userContext);

  await firestore3.collection("whatsappInsuranceOrders")
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

// Confirm and Pay – RW
async function confirmAndPayRW(phone, selectedInstallmentChoice, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const totalCost = userContext.calculatedTotal || 0;
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
        text: "Emeza & Wishyure"
      },
      body: {
        text: `Total: FRW ${formatNum(installmentBreakdown)}`
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "agree_to_terms_rw",
              title: "Emeza & Wishyure"
            }
          },
          {
            type: "reply",
            reply: {
              id: "cancel_payment_rw",
              title: "Hagarika"
            }
          }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContext.stage = "EXPECTING_CONFIRM_PAY";
  userContexts.set(phone, userContext);
}

// Process Payment – RW
async function processPaymentRW(phone, paymentPlan, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  userContext.userPhone = phone;
  

// Get totalCost from the userContext or Firebase if available
  let totalCost = 0;
  
  // If we have insuranceDocRef, fetch the latest totalCost from Firebase
  if (userContext.insuranceDocRef) {
  try {
    const docSnap = await userContext.insuranceDocRef.get();
    if (docSnap.exists) {
      totalCost = docSnap.data().totalCost || totalCost;
    }
  } catch (error) {
    console.error("Error fetching totalCost from Firebase:", error);
  }
}

  
  const formatNumber = (num) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let installmentBreakdown = "";

  switch (paymentPlan) {
    case "installment_cat1_rw":
    case "i_cat1":
      installmentBreakdown = `Ukwezi 1: FRW ${formatNumber(totalCost * 0.25)}`;
      userContext.selectedInstallment = "CAT 1";
      break;
    case "installment_cat2_rw":
    case "i_cat2":
      installmentBreakdown = `Amezi 3: FRW ${formatNumber(totalCost * 0.5)}`;
      userContext.selectedInstallment = "CAT 2";
      break;
    case "installment_cat3_rw":
    case "i_cat3":
      installmentBreakdown = `Amezi 6: FRW ${formatNumber(totalCost * 0.75)}`;
      userContext.selectedInstallment = "CAT 3";
      break;
    case "installment_cat4_rw":
    case "i_cat4":
      installmentBreakdown = `Ukwezi 1: FRW ${formatNumber(totalCost * 0.25)}, 3M: FRW ${formatNumber(totalCost * 0.35)}`;
      userContext.selectedInstallment = "CAT 4";
      break;
    case "full_payment_rw":
    case "i_catf":
      installmentBreakdown = `Wiyishyuriye yose: FRW ${formatNumber(totalCost)}`;
      userContext.selectedInstallment = "FULL";
      break;
    default:
      installmentBreakdown = "Unknown payment plan.";
      userContext.selectedInstallment = "UNKNOWN";
  }

  userContext.totalCost = totalCost;

  const ussdCode = `*182*1*1*0788767816*${totalCost}#`;

  const paymentPayload = {
    type: "text",
    text: {
      body: `*Kwishyura Ubwishingizi*\nTotal: FRW ${formatNumber(totalCost)}\nMurakoze! Noneho ishyura ukoresheje MoMo kuri iyi nimero: ${250788767816}\n e.g: ${ussdCode}\nIzina: IKANISA.`
    }
  };
  
  // Add a button to copy the USSD code
  const copyUssdPayloadTwo = {
    type: "text",
    text: {
      body: `*Kwishyura Ubwishingizi*\nTotal: FRW ${formatNumber(totalCost)}\nMurakoze! Noneho ishyura ukoresheje MoMo kuri iyi nimero: ${250788767816}\nIzina: IKANISA.`        
    }
  };

  const ussdText = {
    type: "text",
    text: {
      body: `${ussdCode}`
    }
  };


  const copyUssdPayload = {
  type: "interactive",
  interactive: {
    type: "button",
    body: {
      text: `*Kwishyura Ubwishingizi*\nTotal: FRW ${formatNumber(totalCost)}\nMurakoze! Noneho ishyura ukoresheje MoMo kuri iyi nimero: 250788767816\nIzina: IKANISA.\nKode: ${ussdCode}`
    },
    action: {
      buttons: [
        {
          type: "phone_number",
          phone_number: "0788767816",
          text: "Fata Kode"
        }
      ]
    }
  }
};

  const namePayload = {
    type: "text",
    text: {
      body: `*Emeza nimero ya MOMO y'uwishyuye*\nMutegereze gato.`
    }
    
  };

  

  console.log("Processing payment for:", phone, paymentPlan);
  userContext.stage = "EXPECTING_PAID_PHONENUMBER";
  userContexts.set(phone, userContext);

  //await sendWhatsAppMessage(phone, paymentPayload, phoneNumberId);
  
  // Send the copy USSD button
  await sendWhatsAppMessage(phone, copyUssdPayloadTwo, phoneNumberId);
  await sendWhatsAppMessage(phone, ussdText, phoneNumberId);
  //await new Promise(resolve => setTimeout(resolve, 3000));
   //await sendWhatsAppMessage(phone, namePayload, phoneNumberId);

  const todayFirebase = new Date();
  const formattedDateFirebase = `${todayFirebase.getDate().toString().padStart(2, "0")}/${(todayFirebase.getMonth() + 1).toString().padStart(2, "0")}/${todayFirebase.getFullYear()}`;

  const insuranceOrderData = {
    userPhone: userContext.userPhone ? String(userContext.userPhone) : "",
    plateNumber: userContext.plateNumber ? String(userContext.plateNumber) : "",
    //insuranceStartDate: userContext.insuranceStartDate ? String(userContext.insuranceStartDate) : "",
    // selectedCoverTypes: userContext.selectedCoverTypes ? String(userContext.selectedCoverTypes) : "",
    selectedPersonalAccidentCoverage: userContext.selectedCoverage ? parseFloat(userContext.selectedCoverage) : 0.0,
    totalCost: totalCost,
    numberOfCoveredPeople: userContext.numberOfCoveredPeople ? parseFloat(userContext.numberOfCoveredPeople) : 0.0,
    selectedInstallment: userContext.selectedInstallment,
    insuranceDocumentUrl: userContext.insuranceDocumentUrl ? String(userContext.insuranceDocumentUrl) : "",
    extractedData: userContext.extractedData ? userContext.extractedData : {},
    sitNumber: userContext.licensedToCarryNumber ? userContext.licensedToCarryNumber : 0,
    creationDate: admin.firestore.Timestamp.now()
  };

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
    sitNumber: userContext.licensedToCarryNumber ? Number(userContext.licensedToCarryNumber) : 0
  };

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
    totalPaid: "0",
    policyStatus: "pending",
    licensedToCarry: userContext.licensedToCarryNumber ? Number(userContext.licensedToCarryNumber) : 0,
    instalment: userContext.selectedInstallment,
    startTime: userContext.insuranceStartDate,
    endTime: userContext.insuranceEndDate,
    transactionId: `WHATSAPP_${Date.now()}_${phone.slice(-4)}`,
    insuranceCompanyName: userContext.insuranceCompany || "Insurance Provider"
  };

  try {
    userContext.insuranceDocRef.update(insuranceOrderData);
    console.log("Insurance order data successfully saved to Firestore");
    userContexts.set(phone, userContext);

    if (vehicleData.licensePlate) {
      await firestore3.collection("vehiclesWhatsapp")
        .doc(vehicleData.licensePlate)
        .set(vehicleData);
      console.log("Vehicle data successfully saved with ID:", vehicleData.licensePlate);
    } else {
      const vehicleDocRef = await firestore3.collection("vehiclesWhatsapp").add(vehicleData);
      console.log("Vehicle data saved with generated ID:", vehicleDocRef.id);
    }

    const quotationDocRef = await firestore3.collection("quotationsWhatsapp").add(quotationData);
    console.log("Quotation data saved with ID:", quotationDocRef.id);

    await userContext.insuranceDocRef.update({ quotationId: quotationDocRef.id });

  } catch (error) {
    console.error("Error saving data to Firestore:", error.message);
  }

  console.log("______________________________________");
  console.log("User context after all flows:", userContext);
}

// Proforma

// Add these endpoints to your existing Express app

// Endpoint to send payment confirmation
app.post("/api/send-payment-confirmation", async (req, res) => {
  try {
    const { orderId, phone } = req.body;
    
    if (!orderId || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID and phone number are required" 
      });
    }

     const userContext = userContexts.get(phone) || {};
    // Update order with payment timestamp if needed
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      paidBool: true
      //paidAt: admin.firestore.FieldValue.serverTimestamp()
    });

     // Read all fields from the original insuranceDocRef (Firestore3)
        const insuranceDocSnapshot = await userContext.insuranceDocRef.get();
        if (insuranceDocSnapshot.exists) {
          const insuranceData = insuranceDocSnapshot.data();

          // Save the entire document to the target Firestore (another firebase app)
          await firestore
            .collection("whatsappInsuranceOrders")
            .doc(insuranceDocSnapshot.id)
            .set(insuranceData, { merge: true });
          console.log(
            `Saved insurance document ${insuranceDocSnapshot.id} with updated payment info to new Firestore.`
          );}
    
    // Send WhatsApp payment confirmation message
    const payloadName2 = {
      type: "text",
      text: {
        body: `*Twakiriye ubwishyu!*\nTwakiriye ubwishyu! Ubu turi gukora ibikenewe ngo twohereze icyemezo cy'Ubwishingizi. Mutegereze gato.`,
      },
    };
    
    // Get phone number ID from your configuration or pass it as needed
    const phoneNumberId = "561637583695258"; // Use your actual phone number ID
    
    await sendWhatsAppMessage(phone, payloadName2, phoneNumberId);
    
    return res.status(200).json({ 
      success: true, 
      message: "Payment confirmation sent successfully"
    });
    
  } catch (error) {
    console.error("Error sending payment confirmation:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to send payment confirmation", 
      error: error.message 
    });
  }
});

// Endpoint to send proforma invoice
app.post("/api/send-proforma", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }
    
    const orderDoc = await firestore3.collection("whatsappInsuranceOrders").doc(orderId).get();
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    const orderData = { id: orderDoc.id, ...orderDoc.data() };
    
    // Instead of generating a PDF, use the uploaded document URL
    if (!orderData.uploadedProformaUrl) {
      return res.status(400).json({ success: false, message: "No uploaded proforma document found" });
    }
    
    // Update order with proforma URL and change status
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      status: "proforma",
      proformaSentAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Send WhatsApp message using the uploaded document URL
    if (orderData.userPhone) {
      const phoneNumber = orderData.userPhone.startsWith('+')
        ? orderData.userPhone.substring(1)
        : orderData.userPhone;
      
      const payload = {
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: `Hola! Twohereje proforma y'ubwishingizi hamwe n’amategeko n’amabwiriza agenga ubwishingizi. Soma neza hanyuma ukande kuri *Emeza & Wishyure*`,
          },
          action: {
            buttons: [{
              type: "reply",
              reply: { id: "done_verification", title: "Emeza & Wishyure" },
            }],
          },
        },
      };

      await sendWhatsAppDocument(phoneNumber, orderData.uploadedProformaUrl, "Proforma Invoice", "", "561637583695258");
      // Optional delay to ensure document is sent first
      await new Promise(resolve => setTimeout(resolve, 1000));
      await sendWhatsAppMessage(phoneNumber, payload, "561637583695258");
      
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Proforma sent successfully",
      proformaUrl: orderData.uploadedProformaUrl
    });
    
  } catch (error) {
    console.error("Error sending proforma:", error);
    return res.status(500).json({ success: false, message: "Failed to send proforma", error: error.message });
  }
});





// Endpoint to mark order as paid
app.post("/api/mark-as-paid", async (req, res) => {
  try {
    const { orderId, paymentReference = null, certificateUrl = null } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }
    
    // Get order details from Firestore (primary Firestore instance)
    const orderDoc = await firestore3.collection("whatsappInsuranceOrders").doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    const orderData = orderDoc.data();
    
    // Mark the order as completed and update paidAmount
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      status: "completed",
      paidAmount: orderData.totalCost,
    });

    // Query for all completed orders of this user to accumulate tokens
    const completedOrdersSnapshot = await firestore3
      .collection("whatsappInsuranceOrders")
      .where("userPhone", "==", orderData.userPhone)
      .where("status", "==", "completed")
      .get();

    // Calculate total tokens: each completed order adds 5000 tokens
    const totalTokens = completedOrdersSnapshot.size * 5000;

    // Update tokens for the current order in both Firestore instances
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      tokens: totalTokens,
    });
    await firestore.collection("whatsappInsuranceOrders").doc(orderId).update({
      tokens: totalTokens,
    });
    
    // Determine the final certificate URL
    let finalCertificateUrl;
    if (certificateUrl || orderData.uploadedInsuranceCertificateUrl) {
      finalCertificateUrl = certificateUrl || orderData.uploadedInsuranceCertificateUrl;
    } else {
      // Generate insurance certificate as fallback
      const certificatePdfBytes = await generateInsuranceCertificate(orderData);
      const certificateFileName = `certificates/${orderId}_${Date.now()}.pdf`;
      const certificateFile = bucket.file(certificateFileName);
      
      await certificateFile.save(Buffer.from(certificatePdfBytes), {
        metadata: { contentType: "application/pdf" },
      });
      
      const [generatedCertificateUrl] = await certificateFile.getSignedUrl({
        action: "read",
        expires: "03-01-2500", // Long expiration date
      });
      
      finalCertificateUrl = generatedCertificateUrl;
    }
    
    // Update order with the certificate URL
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      certificateUrl: finalCertificateUrl,
    });
    
    // Send WhatsApp message with certificate to customer, if a phone is provided
    if (orderData.userPhone) {
      const phoneNumber = orderData.userPhone.startsWith('+')
        ? orderData.userPhone.substring(1)
        : orderData.userPhone;

      const payload = {
        type: "text",
        text: {
          body: `*Icyemezo Cy'Ubwishingizi*\nMwakiriye Icyemezo cyawe cy'ubwishingizi. Turagushimiye kandi tukwifurije umutekano mu muhanda.`,
        },
      };

      const payload2 = {
        type: "text",
        text: {
          body: `*Uhawe ishimwe rya tokens FRW ${totalTokens}*\nMurakoze guhitamo SanlamAllianz! Nk'ishimwe, mumenyeshwa tokens zose muzabona zikubye FRW 5,000 ku bw'ibicuruzwa byanyu byuzuye.`,
        },
      };
      
      // Send the certificate document first
      await sendWhatsAppDocument(
        phoneNumber, 
        finalCertificateUrl, 
        "Insurance Certificate", 
        "Insurance certificate", 
        "561637583695258"
      );
      
      // Small delay to ensure the document is sent first
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then send the text messages
      await sendWhatsAppMessage(phoneNumber, payload, "561637583695258");
      await sendWhatsAppMessage(phoneNumber, payload2, "561637583695258");
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Payment processed successfully",
      certificateUrl: finalCertificateUrl,
      tokens: totalTokens
    });
    
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ success: false, message: "Failed to process payment", error: error.message });
  }
});


// Endpoint to mark order as paid
app.post("/api/mark-as-paid-old-two", async (req, res) => {
  try {
    const { orderId, paymentReference = null, certificateUrl = null } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }
    
    // Get order details from Firestore
    const orderDoc = await firestore3.collection("whatsappInsuranceOrders").doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    const orderData = orderDoc.data();
    
    // Update order with payment details
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      status: "completed",
      paidAmount: orderData.totalCost,
      tokens: orderData.tokens
    });

    // Update order with payment details
    await firestore.collection("whatsappInsuranceOrders").doc(orderId).update({
      tokens: orderData.tokens
    });
    
    let finalCertificateUrl;
    
    // If a certificateUrl is provided in the request, use it (uploaded document)
    if (certificateUrl || orderData.uploadedInsuranceCertificateUrl) {
      finalCertificateUrl = certificateUrl || orderData.uploadedInsuranceCertificateUrl;
    } else {
      // Otherwise generate insurance certificate (fallback to original behavior)
      const certificatePdfBytes = await generateInsuranceCertificate(orderData);
      
      // Upload certificate to Firebase Storage
      const certificateFileName = `certificates/${orderId}_${Date.now()}.pdf`;
      const certificateFile = bucket.file(certificateFileName);
      
      await certificateFile.save(Buffer.from(certificatePdfBytes), {
        metadata: {
          contentType: 'application/pdf',
        }
      });
      
      // Get download URL for certificate
      const [generatedCertificateUrl] = await certificateFile.getSignedUrl({
        action: 'read',
        expires: '03-01-2500', // Long expiration
      });
      
      finalCertificateUrl = generatedCertificateUrl;
    }
    
    // Update order with certificate URL
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      certificateUrl: finalCertificateUrl
    });
    
    // Send WhatsApp message with certificate to customer
    if (orderData.userPhone) {
      const phoneNumber = orderData.userPhone.startsWith('+') 
        ? orderData.userPhone.substring(1) 
        : orderData.userPhone;

      const payload = {
        type: "text",
        text: {
          body: `*Icyemezo Cy'Ubwishingizi*\nMwakiriye Icyemezo cyawe cy'ubwishingizi. Turagushimiye kandi tukwifurije umutekano mu muhanda.`,
        },
      };

      const payload2 = {
        type: "text",
        text: {
          body: `*Uhawe ishimwe rya tokens FRW 5,000*\nMurakoze guhitamo SanlamAllianz! Nk'ishimwe muhawe tokens zingana na FRW 5,000 zikoreshwa gusa mu kwishyura Urugendo kuri Lifuti.`,
        },
      };
      
      // Send document first
      await sendWhatsAppDocument(
        phoneNumber, 
        finalCertificateUrl, 
        "Insurance Certificate", 
        "Insurance certificate", 
        "561637583695258"
      );
      
      // Optional delay to ensure document is sent first
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Then send the text message
      await sendWhatsAppMessage(
        phoneNumber,
        payload,
        "561637583695258"
      );
      
      // Send the bonus message
      await sendWhatsAppMessage(
        phoneNumber,
        payload2,
        "561637583695258"
      );
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Payment processed successfully",
      certificateUrl: finalCertificateUrl
    });
    
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ success: false, message: "Failed to process payment", error: error.message });
  }
});


// Endpoint to mark order as paid 0ld
app.post("/api/mark-as-paid-old", async (req, res) => {
  try {
    const { orderId, paymentReference = null } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }
    
    // Get order details from Firestore
    const orderDoc = await firestore3.collection("whatsappInsuranceOrders").doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    const orderData = orderDoc.data();
    
    // Update order with payment details
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      status: "completed",
      paidAmount: orderData.totalCost,
      paymentReference: paymentReference || `PAY-${Date.now()}`,
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Generate insurance certificate
    const certificatePdfBytes = await generateInsuranceCertificate(orderData);
    
    // Upload certificate to Firebase Storage
    const certificateFileName = `certificates/${orderId}_${Date.now()}.pdf`;
    const certificateFile = bucket.file(certificateFileName);
    
    await certificateFile.save(Buffer.from(certificatePdfBytes), {
      metadata: {
        contentType: 'application/pdf',
      }
    });
    
    // Get download URL for certificate
    const [certificateUrl] = await certificateFile.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Long expiration
    });
    
    // Update order with certificate URL
    await firestore3.collection("whatsappInsuranceOrders").doc(orderId).update({
      certificateUrl: certificateUrl
    });
    
    // Send WhatsApp message with certificate to customer
    if (orderData.userPhone) {
      const phoneNumber = orderData.userPhone.startsWith('+') 
        ? orderData.userPhone.substring(1) 
        : orderData.userPhone;

      const payload = {
    type: "text",
    text: {
      body: `*Icyemezo Cy'Ubwishingizi*\nMwakiriye Icyemezo cyawe cy’ubwishingizi. Turagushimiye kandi tukwifurije umutekano mu muhanda.`,
    },
  };

      const payload2 = {
    type: "text",
    text: {
      body: `*Uhawe ishimwe rya tokens FRW 5,000*\nMurakoze guhitamo SanlamAllianz! Nk'ishimwe muhawe tokens zingana na FRW 5,000 zikoreshwa gusa mu kwishyura Urugendo kuri Lifuti.`,
    },
  };
      
      await sendWhatsAppMessage(
        phoneNumber,
        payload,
        "561637583695258"
      );
      
      // Send the certificate document
      await sendWhatsAppDocument(phoneNumber, certificateUrl, "Insurance Certificate", "Insurance certificate", "561637583695258");
    }
    
    return res.status(200).json({ 
      success: true, 
      message: "Payment processed successfully",
      certificateUrl: certificateUrl
    });
    
  } catch (error) {
    console.error("Error processing payment:", error);
    return res.status(500).json({ success: false, message: "Failed to process payment", error: error.message });
  }
});

// Function to generate a PDF proforma invoice
async function generateProformaInvoice(orderData) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  
  // Get fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Document title
  page.drawText('PROFORMA INVOICE', {
    x: 50,
    y: height - 50,
    size: 24,
    font: boldFont,
  });
  
  // Company information
  page.drawText('Your Insurance Company', {
    x: 50,
    y: height - 100,
    size: 12,
    font: boldFont,
  });
  
  page.drawText('123 Insurance Street', {
    x: 50,
    y: height - 120,
    size: 10,
    font: font,
  });
  
  page.drawText('Phone: +123 456 7890', {
    x: 50,
    y: height - 140,
    size: 10,
    font: font,
  });
  
  // Invoice information
  page.drawText(`Proforma Number: PRO-${orderData.id}`, {
    x: 300,
    y: height - 100,
    size: 10,
    font: font,
  });
  
  const today = new Date();
  page.drawText(`Date: ${today.toLocaleDateString()}`, {
    x: 300,
    y: height - 120,
    size: 10,
    font: font,
  });
  
  // Customer information
  page.drawText('CUSTOMER DETAILS', {
    x: 50,
    y: height - 180,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Name: ${orderData.policyholderName || 'N/A'}`, {
    x: 50,
    y: height - 200,
    size: 10,
    font: font,
  });
  
  page.drawText(`Phone: ${orderData.userPhone || 'N/A'}`, {
    x: 50,
    y: height - 220,
    size: 10,
    font: font,
  });
  
  page.drawText(`TIN: ${orderData.tin || 'N/A'}`, {
    x: 50,
    y: height - 240,
    size: 10,
    font: font,
  });
  
  // Vehicle information
  page.drawText('VEHICLE DETAILS', {
    x: 50,
    y: height - 280,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Plate Number: ${orderData.plateNumber || 'N/A'}`, {
    x: 50,
    y: height - 300,
    size: 10,
    font: font,
  });
  
  page.drawText(`Make/Model: ${orderData.markAndType || 'N/A'}`, {
    x: 50,
    y: height - 320,
    size: 10,
    font: font,
  });
  
  page.drawText(`Chassis Number: ${orderData.chassis || 'N/A'}`, {
    x: 50,
    y: height - 340,
    size: 10,
    font: font,
  });
  
  // Insurance details
  page.drawText('INSURANCE DETAILS', {
    x: 50,
    y: height - 380,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Coverage Type: ${orderData.selectedCoverTypes || 'N/A'}`, {
    x: 50,
    y: height - 400,
    size: 10,
    font: font,
  });
  
  page.drawText(`Start Date: ${orderData.insuranceStartDate || 'N/A'}`, {
    x: 50,
    y: height - 420,
    size: 10,
    font: font,
  });
  
  page.drawText(`Expiry Date: ${orderData.expiryDate || 'N/A'}`, {
    x: 50,
    y: height - 440,
    size: 10,
    font: font,
  });
  
  // Payment information
  page.drawText('PAYMENT DETAILS', {
    x: 50,
    y: height - 480,
    size: 14,
    font: boldFont,
  });
  
  // Draw table header
  page.drawText('Description', {
    x: 50,
    y: height - 500,
    size: 10,
    font: boldFont,
  });
  
  page.drawText('Amount', {
    x: 400,
    y: height - 500,
    size: 10,
    font: boldFont,
  });
  
  // Draw line
  page.drawLine({
    start: { x: 50, y: height - 510 },
    end: { x: 500, y: height - 510 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Base premium
  page.drawText('Base Premium', {
    x: 50,
    y: height - 530,
    size: 10,
    font: font,
  });
  
  page.drawText(`${orderData.netPremium || 0}`, {
    x: 400,
    y: height - 530,
    size: 10,
    font: font,
  });
  
  // Personal accident coverage
  page.drawText('Personal Accident Coverage', {
    x: 50,
    y: height - 550,
    size: 10,
    font: font,
  });
  
  page.drawText(`${orderData.selectedPersonalAccidentCoverage || 0}`, {
    x: 400,
    y: height - 550,
    size: 10,
    font: font,
  });
  
  // Draw line
  page.drawLine({
    start: { x: 50, y: height - 570 },
    end: { x: 500, y: height - 570 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Total
  page.drawText('Total Amount Due', {
    x: 50,
    y: height - 590,
    size: 12,
    font: boldFont,
  });
  
  page.drawText(`${orderData.totalCost || 0}`, {
    x: 400,
    y: height - 590,
    size: 12,
    font: boldFont,
  });
  
  // Payment instructions
  page.drawText('PAYMENT INSTRUCTIONS', {
    x: 50,
    y: height - 630,
    size: 14,
    font: boldFont,
  });
  
  page.drawText('Please make payment using Mobile Money to the following number:', {
    x: 50,
    y: height - 650,
    size: 10,
    font: font,
  });
  
  page.drawText('Mobile Money: +123 456 789', {
    x: 50,
    y: height - 670,
    size: 10,
    font: boldFont,
  });
  
  page.drawText(`Reference: PRO-${orderData.id}`, {
    x: 50,
    y: height - 690,
    size: 10,
    font: boldFont,
  });
  
  // Note
  page.drawText('Note: This proforma invoice is valid for 7 days from the issue date.', {
    x: 50,
    y: height - 730,
    size: 10,
    font: font,
    color: rgb(0.5, 0, 0),
  });
  
  // Get PDF as bytes
  const pdfBytes = await pdfDoc.save();
  
  return pdfBytes;
}

// Function to generate an insurance certificate
async function generateInsuranceCertificate(orderData) {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const { width, height } = page.getSize();
  
  // Get fonts
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Document title
  page.drawText('INSURANCE CERTIFICATE', {
    x: 50,
    y: height - 50,
    size: 24,
    font: boldFont,
  });
  
  // Company information
  page.drawText('Your Insurance Company', {
    x: 50,
    y: height - 100,
    size: 12,
    font: boldFont,
  });
  
  page.drawText('123 Insurance Street', {
    x: 50,
    y: height - 120,
    size: 10,
    font: font,
  });
  
  page.drawText('Phone: +123 456 7890', {
    x: 50,
    y: height - 140,
    size: 10,
    font: font,
  });
  
  // Certificate information
  page.drawText(`Policy Number: ${orderData.policyNo || `POL-${orderData.id}`}`, {
    x: 300,
    y: height - 100,
    size: 10,
    font: boldFont,
  });
  
  const today = new Date();
  page.drawText(`Issue Date: ${today.toLocaleDateString()}`, {
    x: 300,
    y: height - 120,
    size: 10,
    font: font,
  });
  
  // Customer information
  page.drawText('INSURED DETAILS', {
    x: 50,
    y: height - 180,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Name: ${orderData.policyholderName || 'N/A'}`, {
    x: 50,
    y: height - 200,
    size: 10,
    font: font,
  });
  
  page.drawText(`National ID: ${orderData.nationalIdNumber || 'N/A'}`, {
    x: 50,
    y: height - 220,
    size: 10,
    font: font,
  });
  
  page.drawText(`Phone: ${orderData.userPhone || 'N/A'}`, {
    x: 50,
    y: height - 240,
    size: 10,
    font: font,
  });
  
  page.drawText(`TIN: ${orderData.tin || 'N/A'}`, {
    x: 50,
    y: height - 260,
    size: 10,
    font: font,
  });
  
  // Vehicle information
  page.drawText('VEHICLE DETAILS', {
    x: 50,
    y: height - 300,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Plate Number: ${orderData.plateNumber || 'N/A'}`, {
    x: 50,
    y: height - 320,
    size: 10,
    font: font,
  });
  
  page.drawText(`Make/Model: ${orderData.markAndType || 'N/A'}`, {
    x: 50,
    y: height - 340,
    size: 10,
    font: font,
  });
  
  page.drawText(`Chassis Number: ${orderData.chassis || 'N/A'}`, {
    x: 50,
    y: height - 360,
    size: 10,
    font: font,
  });
  
  page.drawText(`Body Type: ${orderData.carBodyType || 'N/A'}`, {
    x: 50,
    y: height - 380,
    size: 10,
    font: font,
  });
  
  page.drawText(`Licensed to Carry: ${orderData.licensedToCarryNo || 'N/A'}`, {
    x: 50,
    y: height - 400,
    size: 10,
    font: font,
  });
  
  page.drawText(`Usage: ${orderData.usage || 'N/A'}`, {
    x: 50,
    y: height - 420,
    size: 10,
    font: font,
  });
  
  // Coverage information
  page.drawText('COVERAGE DETAILS', {
    x: 50,
    y: height - 460,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Coverage Type: ${orderData.selectedCoverTypes || 'N/A'}`, {
    x: 50,
    y: height - 480,
    size: 10,
    font: font,
  });
  
  page.drawText(`Personal Accident Cover: ${orderData.selectedPersonalAccidentCoverage ? 'Yes' : 'No'}`, {
    x: 50,
    y: height - 500,
    size: 10,
    font: font,
  });
  
  page.drawText(`Start Date: ${orderData.insuranceStartDate || 'N/A'}`, {
    x: 50,
    y: height - 520,
    size: 10,
    font: font,
  });
  
  page.drawText(`Expiry Date: ${orderData.expiryDate || 'N/A'}`, {
    x: 50,
    y: height - 540,
    size: 10,
    font: font,
  });
  
  // Premium information
  page.drawText('PREMIUM DETAILS', {
    x: 50,
    y: height - 580,
    size: 14,
    font: boldFont,
  });
  
  page.drawText(`Total Premium Paid: ${orderData.totalCost || 0}`, {
    x: 50,
    y: height - 600,
    size: 10,
    font: font,
  });
  
  page.drawText(`Payment Date: ${today.toLocaleDateString()}`, {
    x: 50,
    y: height - 620,
    size: 10,
    font: font,
  });
  
  // Legal text
  page.drawText('This certificate is evidence of a contract of insurance and is issued', {
    x: 50,
    y: height - 660,
    size: 8,
    font: font,
  });
  
  page.drawText('as a matter of information only. It confers no rights upon the certificate holder.', {
    x: 50,
    y: height - 675,
    size: 8,
    font: font,
  });
  
  // Signature
  page.drawText('Authorized Signature:', {
    x: 50,
    y: height - 720,
    size: 10,
    font: boldFont,
  });
  
  page.drawLine({
    start: { x: 150, y: height - 730 },
    end: { x: 250, y: height - 730 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  
  // Get PDF as bytes
  const pdfBytes = await pdfDoc.save();
  
  return pdfBytes;
}



// Function to send WhatsApp document
async function sendWhatsAppDocument(phoneNumber, documentUrl, fileName, caption, phone_number_id) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${VERSION}/${phone_number_id}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "document",
        document: {
          link: documentUrl,
          filename: fileName,
          caption: caption
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ACCESS_TOKEN}`
        }
      }
    );
    
    console.log("WhatsApp document sent successfully:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error sending WhatsApp document:", error);
    throw error;
  }
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

  textMessageCases.set('ubwishingizi', async (userContext, phone, phoneNumberId) => {
    await sendWelcomeMessageRW(phone, phoneNumberId);
  });
  
  textMessageCases.set('lifuti', async (userContext, phone, phoneNumberId) => {
    await sendLifutiWelcomeMessage(phone, phoneNumberId);
  });

  // New case: send default catalog (using the keyword "catalog")
  textMessageCases.set('catalog', async (userContext, phone, phoneNumberId) => {
    await sendClassSelectionMessage(phone, phoneNumberId);
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
      
      if (vendorData.name) {
        const name = vendorData.name;
        const keyword = name; //`${name}ICUPA`;
        addKeywordToTextHandler(keyword, vendorId);
      }
      
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


// Function to create and populate mt_menuQrCodes collection from mt_vendors
const createMenuQrCodesFromVendors = async () => {
  try {
    // Get all vendors
    const vendorsSnapshot = await firestore2.collection('mt_vendors').get();
    
    // Batch write to efficiently create multiple documents
    let batch = firestore2.batch();
    let operationCount = 0;
    
    for (const vendorDoc of vendorsSnapshot.docs) {
      const vendorId = vendorDoc.id;
      const vendorData = vendorDoc.data();
      
      // Skip if vendor doesn't have necessary data
      if (!vendorData.name || !vendorData.phone) {
        continue;
      }
      
      // Create a new document reference in the mt_menuQrCodes collection
      const qrDocRef = firestore2.collection('mt_menuQrCodes').doc();
      
      // Format the vendor name for URL (replace spaces with %20)
      const vendorNameForUrl = vendorData.name.replace(/ /g, '%20');

      const lifutiPhone = "+250795467385";
      // Create WhatsApp URL with vendor name in the text parameter
      const vendorUrl = `https://wa.me/${lifutiPhone}?text=${vendorNameForUrl}`;
      
      // Prepare the document data
      const qrCodeData = {
        vendorId: vendorId,
        vendorName: vendorData.name,
        vendorUrl: vendorUrl,
        // Add any other fields you need
      };
      
      // Add the operation to the batch
      batch.set(qrDocRef, qrCodeData);
      operationCount++;
      
      // Firestore has a limit of 500 operations per batch
      if (operationCount >= 450) {
        await batch.commit();
        console.log(`Committed batch of ${operationCount} QR code documents`);
        batch = firestore2.batch();
        operationCount = 0;
      }
    }
    
    // Commit any remaining operations
    if (operationCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${operationCount} QR code documents`);
    }
    
    console.log('Successfully created menu QR codes collection from vendors');
  } catch (error) {
    console.error('Error creating menu QR codes collection:', error);
  }
};


// Initialize the system
const initializeSystem = () => {
  initializeDefaultCases();
  createMenuQrCodesFromVendors();
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
  const userContext = userContexts.get(phone) || {};
  const payload = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: `*Your order’s looking good!*\nWant to add anything else before checkout? 🍕🍷` },
      action: {
        buttons: [
          { type: "reply", reply: { id: "MORE", title: "More" } },
          { type: "reply", reply: { id: "ORDERTWO", title: "Checkout" } }
        ]
      }
    }
  };

  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContext.stage = "PAY_PROMPT";
    userContexts.set(phone, userContext);
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


async function sendPaidPhoneNumber(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  const namePayload = {
    type: "text",
    text: {
      body: `*Momo Phone Number*\nProvide the phone number used to pay.`
    }
    
  };

  

  console.log("Processing payment for:", phone, paymentPlan);
  userContext.stage = "EXPECTING_PAID_PHONENUMBER";
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
  if (order.length === 0) {
    console.error("No items in the order for phone:", phone);
    return;
  }
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



// Payment Information
async function sendPaymentInfoTwo(phone, phoneNumberId) {
  const userContext = userContexts.get(phone) || {};
  if (!userContext) {
    console.log("No user context found for phone:", phone);
    return;
  }
  

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: {
      body: `USSD code with button`
    }
   
  };
  
  await sendWhatsAppMessage(phone, payload, phoneNumberId);
  userContexts.delete(phone);
}


// Function to send a message with a USSD code using an interactive message with a URL button
async function sendMessageWithUSSDCallButton(phone, phoneNumberId) {
  try {
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;

    // If the USSD code contains a placeholder {phonenumber}, replace it with the provided phoneParam.
    let finalUssdCode = "*182*1*1*0798922640#";
    
    
    // Encode the USSD code so that special characters are URL-safe
    const encodedUssdCode = finalUssdCode.replace(/\*/g, "%2A").replace(/#/g, "%23");
    const telUrl = `tel:${encodedUssdCode}`; // This URL will trigger the dialer with the USSD code

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "template",
      template: {
        name: "paymentmessage",
        language: {
          code: "en_US"
        },
        components: [
          {
            type: "body",
            // No parameters in body if your template doesn't have any
          },
          {
            type: "button",
            sub_type: "URL",  // Use URL type for telephone URLs
            index: 0,
            parameters: [
              {
                type: "text",
                text: telUrl  // Format: tel:%2A123%2A456%23
              }
            ]
          }
        ]
      }
    };

    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      data: payload
    });

    console.log("Message with USSD button sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error("Error sending message:", error.response?.data || error.message);
    throw error;
  }
}


// Multivendor with the other style of catalog




// Function to fetch products for the vendor from Firebase using a structured query.
async function getFirebaseProducts() {
  try {
    const firebaseConfig = {
      apiKey: "AIzaSyAJ3EwNw_WXwmuB5PgEj6JCh8JxXWvBkoE",
      projectId: "icupa-396da",
    };
    const { apiKey, projectId } = firebaseConfig;
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const queryUrl = `${baseUrl}:runQuery?key=${apiKey}`;

    const requestBody = {
      structuredQuery: {
        from: [{ collectionId: "mt_products" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "vendor" },
            op: "EQUAL",
            value: { stringValue: "01hg3nZj5DeyaE8dflJh" }
          }
        }
      }
    };

    const response = await axios.post(queryUrl, requestBody);
    const dataArray = response.data;
    
    // Filter out items without a document and extract the doc id.
    const documents = dataArray
      .filter(item => item.document)
      .map(item => {
        const doc = item.document;
        const docId = doc.name.split('/').pop();
        return { ...doc, docId };
      });
      
    return documents;
  } catch (error) {
    console.error("Error fetching firebase products:", error.message);
    throw error;
  }
}

// Function to fetch all subcategories from mt_subCategories.
async function getSubCategories() {
  try {
    const firebaseConfig = {
      apiKey: "AIzaSyAJ3EwNw_WXwmuB5PgEj6JCh8JxXWvBkoE",
      projectId: "icupa-396da",
    };
    const { apiKey, projectId } = firebaseConfig;
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const queryUrl = `${baseUrl}:runQuery?key=${apiKey}`;
    
    const requestBody = {
      structuredQuery: {
        from: [{ collectionId: "mt_subCategories" }]
      }
    };

    const response = await axios.post(queryUrl, requestBody);
    const dataArray = response.data;
    const documents = dataArray
      .filter(item => item.document)
      .map(item => {
        const doc = item.document;
        const docId = doc.name.split('/').pop();
        return { ...doc, docId };
      });
    return documents;
  } catch (error) {
    console.error("Error fetching subcategories:", error.message);
    throw error;
  }
}


async function sendDefaultCatalog(phone, phoneNumberId, selectedClass) {
  try {
    // Retrieve products from Firebase.
    const products = await getFirebaseProducts();
    let items = [];

    if (selectedClass === "Food") {
      // Filter products to only include Food.
      items = products.filter(product => {
        return product.fields && product.fields.classes && product.fields.classes.stringValue === "Food";
      }).map(product => ({ product_retailer_id: product.docId }));
    } else if (selectedClass === "Drinks") {
      // For drinks, first fetch subcategories.
      const subCategoriesDocs = await getSubCategories();
      const subCatMapping = {};
      subCategoriesDocs.forEach(doc => {
        if (doc.fields && doc.fields.name && doc.fields.name.stringValue) {
          subCatMapping[doc.docId] = doc.fields.name.stringValue.toUpperCase();
        }
      });
      // Define allowed soft drink subcategory names.
      const allowedSoftDrinks = new Set(["BEERS", "COCKTAILS", "LIQUORS", "WINES"]);

      // Group products by subcategory.
      const drinksBySubCat = {};
      products.forEach(product => {
        if (product.fields && product.fields.classes && product.fields.classes.stringValue !== "Food") {
          const subCatId = product.fields.subcategory && product.fields.subcategory.stringValue;
          if (subCatId && subCatMapping[subCatId]) {
            const subCatName = subCatMapping[subCatId];
            if (allowedSoftDrinks.has(subCatName)) {
              if (!drinksBySubCat[subCatName]) {
                drinksBySubCat[subCatName] = [];
              }
              drinksBySubCat[subCatName].push(product);
            }
          }
        }
      });

      // Limit each subcategory group to maximum 5 items.
      for (const subCatName in drinksBySubCat) {
        drinksBySubCat[subCatName] = drinksBySubCat[subCatName].slice(0, 1);
      }

      // Order products in round-robin fashion:
      // Loop through each subcategory taking one item per round until all groups are exhausted.
      const orderedDrinks = [];
      let roundIndex = 0;
      let itemsRemaining = true;
      while (itemsRemaining) {
        itemsRemaining = false;
        Object.keys(drinksBySubCat).forEach(subCatName => {
          const group = drinksBySubCat[subCatName];
          if (group.length > roundIndex) {
            orderedDrinks.push(group[roundIndex]);
            itemsRemaining = true;
          }
        });
        roundIndex++;
      }
      // Map orderedDrinks to the required format.
      items = orderedDrinks.map(product => ({ product_retailer_id: product.docId }));
    }

    // Limit to maximum 30 items.
    const limitedItems = items.slice(0, 30);
    if (limitedItems.length === 0) {
      throw new Error(`No ${selectedClass} products found.`);
    }

    // Build a single section for the selected class.
    const sections = [{
      title: selectedClass,
      product_items: limitedItems
    }];

    // Build the WhatsApp catalog payload.
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { type: "text", text: "ICUPA App" },
        body: { text: `Order ${selectedClass} and enjoy free delivery!` },
        action: {
          catalog_id: "1366407087873393",
          sections: sections
        }
      }
    };

    // Send the catalog via your HTTP client (axios).
    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    console.log("Catalog sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error("Error sending catalog:", error.response?.data || error.message);
    throw error;
  }
}

// Old
async function sendDefaultCatalogTwo(phone, phoneNumberId, selectedClass) {
  try {
    // Retrieve products from Firebase.
    const products = await getFirebaseProducts();
    let items = [];

    if (selectedClass === "Food") {
      // Filter products to only include Food.
      items = products.filter(product => {
        return product.fields && product.fields.classes && product.fields.classes.stringValue === "Food";
      }).map(product => ({ product_retailer_id: product.docId }));
    } else if (selectedClass === "Drinks") {
      // For drinks, first fetch subcategories.
      const subCategoriesDocs = await getSubCategories();
      const subCatMapping = {};
      subCategoriesDocs.forEach(doc => {
        if (doc.fields && doc.fields.name && doc.fields.name.stringValue) {
          subCatMapping[doc.docId] = doc.fields.name.stringValue.toUpperCase();
        }
      });
      // Define allowed soft drink subcategory names. "SODA", "JUICES", "WATER", "COFFEE", "TEA", "ENERGY DRINKS", "WHISKEY", "RUM", "GIN", 
      const allowedSoftDrinks = new Set(["BEERS", "COCKTAILS", "LIQUORS", "WINES"]);

      // Filter products that are not Food and whose subcategory name is allowed.
      items = products.filter(product => {
        if (product.fields && product.fields.classes && product.fields.classes.stringValue !== "Food") {
          const subCatId = product.fields.subcategory && product.fields.subcategory.stringValue;
          if (subCatId && subCatMapping[subCatId]) {
            const subCatName = subCatMapping[subCatId];
            return allowedSoftDrinks.has(subCatName);
          }
        }
        return false;
      }).map(product => ({ product_retailer_id: product.docId }));
    }

    // Limit to maximum 30 items.
    const limitedItems = items.slice(0, 30);
    if (limitedItems.length === 0) {
      throw new Error(`No ${selectedClass} products found.`);
    }

    // Build a single section for the selected class.
    const sections = [{
      title: selectedClass,
      product_items: limitedItems
    }];

    // Build the WhatsApp catalog payload.
    const url = `https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "interactive",
      interactive: {
        type: "product_list",
        header: { type: "text", text: "ICUPA App" },
        body: { text: `Order ${selectedClass} and enjoy free delivery!` },
        action: {
          catalog_id: "1366407087873393",
          sections: sections
        }
      }
    };

    // Send the catalog via your HTTP client (axios).
    const response = await axios({
      method: "POST",
      url: url,
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    console.log("Catalog sent successfully to:", phone);
    return response.data;
  } catch (error) {
    console.error("Error sending catalog:", error.response?.data || error.message);
    throw error;
  }
}


// handleOrder
const handleOrder = async (message, changes, displayPhoneNumber, phoneNumberId) => {
  const order = message.order;
  const orderId = message.id;
  const customerInfo = {
    phone: changes.value.contacts[0].wa_id,
    receiver: displayPhoneNumber,
  };
  const items = order.product_items;
  const totalAmount = items.reduce((total, item) => total + item.item_price * item.quantity, 0);

  try {
    // Get or create user context
    let userContext = userContexts.get(customerInfo.phone) || {};
    
    // Transform catalog order items into order context
    userContext.orderNew = items.map(item => ({
      id: item.product_retailer_id,  // Assuming this matches your product ID
      name: item.item_name,
      price: item.item_price,
      quantity: item.quantity
    }));

    // Save additional order metadata
    userContext.orderId = orderId;
    userContext.totalAmount = totalAmount;

    // Update user context
    userContexts.set(customerInfo.phone, userContext);

    // Proceed with order flow
    await sendOrderPrompt(customerInfo.phone, phoneNumberId);
    console.log("Order saved successfully.");
  } catch (error) {
    console.error("Error saving order:", error.message);
  }
};

async function createWhatsappOrderNew(phone) {
  let userContext = userContexts.get(phone) || {};
  if (!userContext || !userContext.orderNew || userContext.orderNew.length === 0) {
    console.error("No items in the order for phone:", phone);
    return;
  }
  
  const order = userContext.orderNew;
  const totalAmount = order.reduce((sum, item) => sum + Number(item.price) * (item.quantity || 1), 0);
  
  // Generate order ID: "ORD-" + YYYYMMDD + "-" + random 6-digit number.
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  const orderId = `ORD-${yyyy}${mm}${dd}-${randomDigits}`;
  
  // Build products array with catalog product details
  const products = order.map(item => ({
    price: Number(item.price),
    product: item.id,
    quantity: item.quantity || 1
    //name: item.name  // Optional: include product name
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
    table: userContext.table,
    user: phone,
    vendor: userContext.vendorId
  };
  
  try {
    await firestore2.collection("mt_whatsappOrders").add(orderObj);
    console.log("Order created with ID:", orderId);
  } catch (error) {
    console.error("Error creating order in Firestore:", error.message);
  }
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
