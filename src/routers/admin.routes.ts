import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { bannerUpload } from '../middlewares/upload.middleware';
import { validateUploadedFiles } from '../middlewares/upload-validate.middleware';
import * as AdminController from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// Dashboard
router.get('/dashboard', AdminController.getDashboard);

// KYC Stats (before parameterised routes)
router.get('/kyc/stats', AdminController.getKycStats);

// Agent KYC
router.get('/kyc/agents',                         AdminController.listAgentKyc);
router.get('/kyc/agents/:agentId',                AdminController.getAgentKycDetail);
router.post('/kyc/agents/:agentId/approve',       AdminController.approveAgentKyc);
router.post('/kyc/agents/:agentId/reject',        AdminController.rejectAgentKyc);

// Dealer KYC
router.get('/kyc/dealers',                        AdminController.listDealerKyc);
router.get('/kyc/dealers/:dealerId',              AdminController.getDealerKycDetail);
router.post('/kyc/dealers/:dealerId/approve',     AdminController.approveDealerKyc);
router.post('/kyc/dealers/:dealerId/reject',      AdminController.rejectDealerKyc);

// Users
router.get('/users', AdminController.listUsers);

// Products
router.get('/products',              AdminController.adminListProducts);
router.post('/products',             AdminController.adminCreateProduct);
router.patch('/products/:id/toggle', AdminController.adminToggleProduct);
router.patch('/products/:id',        AdminController.adminUpdateProduct);

// Categories
router.get('/categories',              AdminController.adminListCategories);
router.post('/categories',             AdminController.adminCreateCategory);
router.patch('/categories/:id/toggle', AdminController.adminToggleCategory);
router.patch('/categories/:id',        AdminController.adminUpdateCategory);

// Brands
router.get('/brands',              AdminController.adminListBrands);
router.post('/brands',             AdminController.adminCreateBrand);
router.patch('/brands/:id/toggle', AdminController.adminToggleBrand);
router.patch('/brands/:id',        AdminController.adminUpdateBrand);

// Services
router.get('/services',              AdminController.adminListServices);
router.post('/services',             AdminController.adminCreateService);
router.patch('/services/:id/toggle', AdminController.adminToggleService);
router.patch('/services/:id',        AdminController.adminUpdateService);

// Bookings — static sub-paths (/assign, /cancel) before /:id
router.get('/bookings',              AdminController.adminListBookings);
router.get('/bookings/:id',          AdminController.adminGetBookingDetail);
router.patch('/bookings/:id/assign', AdminController.adminAssignBooking);
router.patch('/bookings/:id/cancel', AdminController.adminCancelBooking);

// Orders — static sub-path (/status) before /:id
router.get('/orders',                AdminController.adminListOrders);
router.get('/orders/:id',            AdminController.adminGetOrderDetail);
router.patch('/orders/:id/status',   AdminController.adminUpdateOrderStatus);

// Banners — static sub-paths before /:id to avoid param capture
router.get('/banners',                AdminController.adminListBanners);
router.post('/banners/upload-image',  bannerUpload.single('image'), validateUploadedFiles, AdminController.adminUploadBannerImage);
router.post('/banners',               AdminController.adminCreateBanner);
router.patch('/banners/reorder',      AdminController.adminReorderBanners);
router.patch('/banners/:id',          AdminController.adminUpdateBanner);
router.delete('/banners/:id',         AdminController.adminDeleteBanner);

export default router;
