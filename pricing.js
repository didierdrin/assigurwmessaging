// pricing.js
import { VehicleModel } from "./vehicle.js";

class VehicleClasses {
  constructor() {
    this.private = "Private";
    this.commercialPassenger = "Commercial Passenger";
    this.commercialGoods = "Commercial Goods";
  }
}
const vehicleClasses = new VehicleClasses();

class PersonalCoverage {
  constructor(title, baseDeath, baseDisability, baseMedical, vehicle, seatNumber) {
    this.title = title;
    this.baseDeath = baseDeath;
    this.baseDisability = baseDisability;
    this.baseMedical = baseMedical;
    this.vehicle = vehicle;
    this.seatNumber = seatNumber;
    if (vehicle.bodyType === "Side Cars & Motor Bikes, Tricycles") {
      this.percent = 0.8 / 100;
    } else if (vehicle.usageType === vehicleClasses.private) {
      this.percent = 0.5 / 100;
    } else {
      this.percent = 1 / 100;
    }
  }

  get death() {
    return this.baseDeath * this.percent * this.seatNumber;
  }

  get disability() {
    return this.baseDisability * this.percent * this.seatNumber;
  }

  get medical() {
    return this.baseMedical * this.percent * this.seatNumber;
  }

  get total() {
    return this.baseDeath * this.percent * this.seatNumber;
  }

  get map() {
    return {
      Death: this.death,
      Disability: this.disability,
      Medical: this.medical,
    };
  }
}

class Instalment {
  constructor(title, options) {
    this.title = title;
    this.options = options;
  }

  toMap() {
    return {
      title: this.title,
      options: this.options,
    };
  }
}

class VehiclePricing {
  constructor(vehicleClass, vehicleType, materialDamage, theft, fire, currentBase, seatLoading = 0.0) {
    this.vehicleClass = vehicleClass;
    this.vehicleType = vehicleType;
    this.materialDamage = materialDamage;
    this.theft = theft;
    this.fire = fire;
    this.currentBase = currentBase;
    this.seatLoading = seatLoading;
  }

  calculatePrice(base, isMaterial, isTheft, isFire) {
    let percent = 0;
    if (isMaterial) percent += this.materialDamage;
    if (isTheft) percent += this.theft;
    if (isFire) percent += this.fire;
    return percent === 0 ? base : (base * percent) / 100;
  }

  getAgeLoading(year) {
    const age = new Date().getFullYear() - year;
    if (age < 6) {
      return 0;
    } else if (age >= 6 && age <= 10) {
      return this.currentBase * 0.25;
    } else if (age >= 11 && age <= 15) {
      return this.currentBase * 0.5;
    } else {
      return 0.0;
    }
  }

  getComesaPercent(start, end) {
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 1) {
      throw new Error("Days cannot be less than 1.");
    } else if (days === 1) {
      return 5.0;
    } else if (days === 2 || days === 3) {
      return 7.5;
    } else if (days >= 4 && days <= 8) {
      return 10.0;
    } else if (days >= 9 && days <= 15) {
      return 12.5;
    } else if (days >= 16 && days <= 30) {
      return 25.0;
    } else if (days > 30 && days <= 61) {
      return 40.0;
    } else if (days > 61 && days <= 92) {
      return 50.0;
    } else if (days > 92 && days <= 123) {
      return 60.0;
    } else if (days > 123 && days <= 153) {
      return 70.0;
    } else if (days > 153 && days <= 184) {
      return 75.0;
    } else if (days > 184 && days <= 214) {
      return 90.0;
    } else if (days > 214 && days <= 366) {
      return 100.0;
    } else {
      throw new Error("Days cannot be more than 365.");
    }
  }
}

function createPersonalCoverages(vehicle, seatNumber) {
  return [
    new PersonalCoverage("CAT I", 1000000, 1000000, 100000, vehicle, seatNumber),
    new PersonalCoverage("CAT II", 2000000, 2000000, 200000, vehicle, seatNumber),
    new PersonalCoverage("CAT III", 3000000, 3000000, 300000, vehicle, seatNumber),
    new PersonalCoverage("CAT IV", 4000000, 4000000, 400000, vehicle, seatNumber),
    new PersonalCoverage("CAT V", 5000000, 5000000, 500000, vehicle, seatNumber),
  ];
}

const instalments = [
  new Instalment("Option 1", [
    { rate: 0.25, name: "1 Month (25%)", period: 1 },
    { rate: 0.25, name: "2 Months (25%)", period: 2 },
    { rate: 0.5, name: "9 Months (50%)", period: 9 },
  ]),
  new Instalment("Option 2", [
    { rate: 0.5, name: "3 Months (50%)", period: 3 },
    { rate: 0.5, name: "9 Months (50%)", period: 9 },
  ]),
  new Instalment("Option 3", [
    { rate: 0.75, name: "6 Months (75%)", period: 6 },
    { rate: 0.25, name: "6 Months (25%)", period: 6 },
  ]),
  new Instalment("Option 4", [
    { rate: 0.25, name: "1 Month (25%)", period: 1 },
    { rate: 0.35, name: "3 Months (35%)", period: 3 },
    { rate: 0.4, name: "8 Months (40%)", period: 8 },
  ]),
];

class CalculatePricing {
  constructor(vehicle, start, end, isComprehensive) {
    let v;
    try {
      // Find a matching pricing object based on usageType and bodyType
      v = pricing.find(
        (element) =>
          element.vehicleClass === vehicle.usageType &&
          element.vehicleType === vehicle.bodyType
      );
      if (!v) throw new Error("Vehicle pricing not found");
    } catch (e) {
      throw new Error("Element not found");
    }

    const passengerLoading = vehicle.sitNumber * v.seatLoading;
    const comesaPercent = v.getComesaPercent(start, end) / 100;
    const ageLoading = v.getAgeLoading(vehicle.year) * comesaPercent;

    this.material = v.calculatePrice(vehicle.vehicleValue, true, false, false) * comesaPercent;
    this.theft = v.calculatePrice(vehicle.vehicleValue, false, true, false) * comesaPercent;
    this.fire = v.calculatePrice(vehicle.vehicleValue, false, false, true) * comesaPercent;
    this.premium = (v.currentBase + passengerLoading) * comesaPercent;
    this.comesa = this.premium * 0.3;

    const cC = vehicle.usageType === vehicleClasses.private ? 0.006 : 0.01;
    this.cTheft = vehicle.vehicleValue * cC * comesaPercent;
    this.cMedical = vehicle.sitNumber * 3000 * comesaPercent;
    this.cCard = 10000;
    this.pAccount = this.premium * 0.3;
    this.cFire = this.fire * 0.3;
    this.mDamage = this.material * 0.3;
    this.comprehensive = this.premium + this.material + this.fire + this.theft;

    if (isComprehensive) {
      this.comprehensive += ageLoading;
    }
  }
}

// The pricing array used for lookup:
const pricing = [
  // private
  new VehiclePricing(vehicleClasses.private, "Side Cars & Motor Bikes, Tricycles", 4.56, 3.57, 0.33, 39000),
  new VehiclePricing(vehicleClasses.private, "Car/Voiture", 2.97, 0.44, 0.3, 57600),
  new VehiclePricing(vehicleClasses.private, "Jeep/SUV", 2.46, 0.37, 0.25, 76200),
  new VehiclePricing(vehicleClasses.private, "Pickup_Camionnenette (small lorry (< 5 tonnes))", 2.58, 0.38, 0.26, 86100),
  new VehiclePricing(vehicleClasses.private, "Minibus/Van", 2.56, 0.34, 0.3, 129600),
  new VehiclePricing(vehicleClasses.private, "School bus", 2.6, 0.35, 0.3, 207000, 5000.0),
  new VehiclePricing(vehicleClasses.private, "Bus", 2.6, 0.35, 0.3, 207000),
  new VehiclePricing(vehicleClasses.private, "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)", 2.8, 0.42, 0.28, 129600),
  new VehiclePricing(vehicleClasses.private, "HOWO, SHACMAN, FUSO, FAW", 4.2, 0.63, 0.42, 378000),
  new VehiclePricing(vehicleClasses.private, "Truck (Camion) & Tractor, Lorry>= 5 tonnes – Camionnette", 0.28, 0.42, 0.28, 150900),
  // commercial passenger
  new VehiclePricing(vehicleClasses.commercialPassenger, "Side-cars & Motor Bikes, Tricycles", 6.95, 7.36, 0.54, 103606),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Car/Voiture", 2.82, 0.71, 0.38, 131400, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Jeep/SUV", 2.82, 0.71, 0.38, 131400, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Minibus/Van", 3.17, 0.91, 0.46, 153600, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "School bus", 3.17, 0.91, 0.46, 153600, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Bus", 2.85, 0.83, 0.41, 153400, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Pickup_Camionnenette (small lorry (< 5 tonnes))", 3.13, 0.79, 0.42, 150900, 14000.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)", 2.8, 0.42, 0.28, 129600),
  new VehiclePricing(vehicleClasses.commercialPassenger, "HOWO, SHACMAN, FUSO, FAW", 4.2, 0.63, 0.42, 378000),
  new VehiclePricing(vehicleClasses.commercialPassenger, "Truck (Camion) & Tractor, Lorry>= 5 tonnes – Camionnette", 0.28, 0.42, 0.28, 150900),
  // commercial goods
  new VehiclePricing(vehicleClasses.commercialGoods, "Side-cars & Motor Bikes, Tricycles", 6.95, 7.36, 0.54, 103606),
  new VehiclePricing(vehicleClasses.commercialGoods, "Car/Voiture", 2.82, 0.71, 0.38, 150900, 7500.0),
  new VehiclePricing(vehicleClasses.commercialGoods, "Jeep/SUV", 2.82, 0.71, 0.38, 150900, 7500.0),
  new VehiclePricing(vehicleClasses.commercialGoods, "Pickup_Camionnenette (small lorry (< 5 tonnes))", 2.8, 0.42, 0.28, 150900, 7500.0),
  new VehiclePricing(vehicleClasses.commercialGoods, "Minibus/Van", 3.17, 0.91, 0.46, 165990, 7500.0),
  new VehiclePricing(vehicleClasses.commercialPassenger, "School bus", 3.17, 0.91, 0.46, 153600, 14000.0),
  new VehiclePricing(vehicleClasses.commercialGoods, "Bus", 3.17, 0.91, 0.46, 226800, 7500.0),
  new VehiclePricing(vehicleClasses.commercialGoods, "Trailer (Remorque) & Semi-Trailer (Semi- Remorque)", 2.8, 0.42, 0.28, 129600),
  new VehiclePricing(vehicleClasses.commercialGoods, "HOWO, SHACMAN, FUSO, FAW", 4.2, 0.63, 0.42, 378000),
  new VehiclePricing(vehicleClasses.commercialGoods, "Truck (Camion) & Tractor, Lorry>= 5 tonnes – Camionnette", 0.28, 0.42, 0.28, 150900),
];



export {
  vehicleClasses as VehicleClasses,
  PersonalCoverage,
  Instalment,
  VehiclePricing,
  CalculatePricing,
  createPersonalCoverages,
  instalments,
  pricing,
};
