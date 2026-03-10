import { Router } from 'express';
import AuthRoutes from './auth.routes';
import CatalogRoutes from './catalog.routes';
import CartRoutes from './cart.routes';
import BookingRoutes from './bookings.routes';
import OrderRoutes from './orders.routes';
import WalletRoutes from './wallet.routes';
import ProfileRoutes from './profile.routes';
import StoreRoutes from './store.routes';
import AgentRoutes from './agent.routes';
import DealerRoutes from './dealer.routes';
import PaymentRoutes from './payment.routes';
import AdminRoutes from './admin.routes';
import BannersRoutes from './banners.routes';
import UtilsRoutes from './utils.routes';

const router = Router();

router.use('/auth', AuthRoutes);
router.use('/', CatalogRoutes); // legacy customer catalog: /services and lightweight /products
router.use('/cart', CartRoutes);
router.use('/bookings', BookingRoutes);
router.use('/orders', OrderRoutes);
router.use('/wallet', WalletRoutes);
router.use('/user', ProfileRoutes);
router.use('/store', StoreRoutes); // store commerce domain: categories + advanced product listing/detail
router.use('/agent', AgentRoutes);
router.use('/dealer', DealerRoutes);
router.use('/payments', PaymentRoutes);
router.use('/admin', AdminRoutes);
router.use('/banners', BannersRoutes);
router.use('/utils', UtilsRoutes);

export default router;
