import { Router } from 'express';
import * as UtilsController from '../controllers/utils.controller';

const router = Router();

router.get('/geocode', UtilsController.geocode);

export default router;
