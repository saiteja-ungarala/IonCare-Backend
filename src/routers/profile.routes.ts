import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { AddressSchema, UpdateAddressSchema, PushTokenSchema } from '../dto/address.dto';
import * as ProfileController from '../controllers/profile.controller';

const router = Router();

router.use(authenticate); // Protect all routes

router.get('/profile', ProfileController.getProfile);
router.patch('/profile', ProfileController.updateProfile);
router.post('/push-token', validate(PushTokenSchema), ProfileController.registerPushToken);

router.get('/addresses', ProfileController.getAddresses);
router.post('/addresses', validate(AddressSchema), ProfileController.addAddress);
router.patch('/addresses/:id/default', ProfileController.setAddressDefault);
router.patch('/addresses/:id', validate(UpdateAddressSchema), ProfileController.updateAddress);
router.delete('/addresses/:id', ProfileController.deleteAddress);

export default router;
