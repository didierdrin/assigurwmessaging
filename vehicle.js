// vehicle.js
class VehicleModel {
  constructor(
    tin,
    sitNumber,
    year,
    make,
    model,
    vin,
    licensePlate,
    bodyType,
    usageType,
    fuelType,
    vehicleValue,
    engineSize,
    images
  ) {
    this.tin = tin;
    this.sitNumber = sitNumber;
    this.year = year;
    this.make = make;
    this.model = model;
    this.vin = vin;
    this.licensePlate = licensePlate;
    this.bodyType = bodyType;
    this.usageType = usageType;
    this.fuelType = fuelType;
    this.vehicleValue = vehicleValue;
    this.engineSize = engineSize;
    this.images = images;
  }

  static fromJSON(json) {
    return new VehicleModel(
      json.tin || 0,
      json.sitNumber || 0,
      json.year || 0,
      json.make || "",
      json.model || "",
      json.vin || "",
      json.licensePlate || "",
      json.bodyType || "",
      json.usageType || "",
      json.fuelType,
      json.vehicleValue || 0,
      json.engineSize,
      (json.images || []).map(e => String(e))
    );
  }

  toJSON() {
    return {
      tin: this.tin,
      sitNumber: this.sitNumber,
      year: this.year,
      make: this.make,
      model: this.model,
      vin: this.vin,
      licensePlate: this.licensePlate,
      bodyType: this.bodyType,
      usageType: this.usageType,
      fuelType: this.fuelType,
      vehicleValue: this.vehicleValue,
      engineSize: this.engineSize,
      images: this.images,
    };
  }

  shared() {
    return {
      year: this.year,
      make: this.make,
      model: this.model,
      licensePlate: this.licensePlate,
      bodyType: this.bodyType,
      usageType: this.usageType,
    };
  }

  toString() {
    return `${this.tin} - ${this.make} - ${this.model} - ${this.year} - ${this.bodyType} - ${this.usageType} - ${this.sitNumber}`;
  }
}

export const VehicleModel;
