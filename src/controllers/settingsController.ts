import type { Request, Response, NextFunction } from 'express';
import { Settings } from '../models/Settings.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function getSettings(_req: Request, res: Response, next: NextFunction) {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    sendSuccess(res, settings);
  } catch (e) {
    next(e);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create(req.body);
    } else {
      Object.assign(settings, req.body);
      await settings.save();
    }
    sendSuccess(res, settings);
  } catch (e) {
    next(e);
  }
}
