import * as mongoose from 'mongoose';

const PodSchema = new mongoose.Schema({
  podType: Number,
  localIp: String,
  spawnTimestamp: Number,
  address: String,
  port: Number,
  ip: String,
  socketId: String,
  active: Boolean,
});

export { PodSchema };
