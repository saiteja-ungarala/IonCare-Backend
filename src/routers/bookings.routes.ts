import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { CreateBookingSchema } from '../dto/booking.dto';
import * as BookingController from '../controllers/bookings.controller';

const router = Router();

router.use(authenticate);

router.get('/', BookingController.getBookings);
router.post('/', validate(CreateBookingSchema), BookingController.createBooking);
router.patch('/:id/cancel', BookingController.cancelBooking);
router.get('/:bookingId/updates', BookingController.getBookingUpdates);

export default router;
