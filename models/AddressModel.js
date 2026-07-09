const { default: mongoose } = require("mongoose");


const AddressSchema = new mongoose.Schema({
  street: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  country: {
    type: String,
    default: 'India',
  },
  zipCode: {
    type: String,
    trim: true,
  },
  coordinates: {
    lat: Number,
    lng: Number,
  },
});

const AddressModel = mongoose.model("address",AddressSchema)

module.exports = AddressModel