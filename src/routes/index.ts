import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.js';
import { bulkDeleteProductsSchema, productSchema, productUpdateSchema } from '../validators/product.js';
import { supplierSchema, customerSchema } from '../validators/party.js';
import { purchaseSchema, purchaseUpdateSchema } from '../validators/purchase.js';
import { salesSchema } from '../validators/sales.js';
import { settingsSchema } from '../validators/settings.js';
import { stockAdjustmentSchema } from '../validators/stock.js';
import { userUpdateSchema } from '../validators/user.js';
import * as auth from '../controllers/authController.js';
import * as product from '../controllers/productController.js';
import * as supplier from '../controllers/supplierController.js';
import * as customer from '../controllers/customerController.js';
import * as purchase from '../controllers/purchaseController.js';
import * as sales from '../controllers/salesController.js';
import * as stock from '../controllers/stockController.js';
import * as dashboard from '../controllers/dashboardController.js';
import * as report from '../controllers/reportController.js';
import * as user from '../controllers/userController.js';
import * as settings from '../controllers/settingsController.js';

const router = Router();

router.post('/auth/login', validateBody(loginSchema), auth.login);

router.use(authenticate);

router.post('/auth/register', authorize('ADMIN'), validateBody(registerSchema), auth.register);

router.get('/auth/me', auth.me);

router.get('/dashboard', authorize('ADMIN', 'MANAGER', 'STAFF'), dashboard.getDashboard);

router.get('/products/export', authorize('ADMIN', 'MANAGER'), product.exportProducts);
router.get('/products', authorize('ADMIN', 'MANAGER', 'STAFF'), product.listProducts);
router.get('/products/:id', authorize('ADMIN', 'MANAGER', 'STAFF'), product.getProduct);
router.post('/products', authorize('ADMIN', 'MANAGER'), validateBody(productSchema), product.createProduct);
router.put('/products/:id', authorize('ADMIN', 'MANAGER'), validateBody(productUpdateSchema), product.updateProduct);
router.delete('/products/:id', authorize('ADMIN', 'MANAGER'), product.deleteProduct);
router.post('/products/bulk-delete', authorize('ADMIN', 'MANAGER'), validateBody(bulkDeleteProductsSchema), product.bulkDeleteProducts);

router.get('/suppliers', authorize('ADMIN', 'MANAGER'), supplier.listSuppliers);
router.get('/suppliers/:id/purchases', authorize('ADMIN', 'MANAGER'), supplier.supplierPurchaseHistory);
router.get('/suppliers/:id', authorize('ADMIN', 'MANAGER'), supplier.getSupplier);
router.post('/suppliers', authorize('ADMIN', 'MANAGER'), validateBody(supplierSchema), supplier.createSupplier);
router.put('/suppliers/:id', authorize('ADMIN', 'MANAGER'), validateBody(supplierSchema.partial()), supplier.updateSupplier);
router.delete('/suppliers/:id', authorize('ADMIN', 'MANAGER'), supplier.deleteSupplier);

router.get('/customers', authorize('ADMIN', 'MANAGER', 'STAFF'), customer.listCustomers);
router.get('/customers/:id/sales', authorize('ADMIN', 'MANAGER', 'STAFF'), customer.customerSalesHistory);
router.get('/customers/:id', authorize('ADMIN', 'MANAGER', 'STAFF'), customer.getCustomer);
router.post('/customers', authorize('ADMIN', 'MANAGER'), validateBody(customerSchema), customer.createCustomer);
router.put('/customers/:id', authorize('ADMIN', 'MANAGER'), validateBody(customerSchema.partial()), customer.updateCustomer);
router.delete('/customers/:id', authorize('ADMIN', 'MANAGER'), customer.deleteCustomer);

router.get('/purchases/export', authorize('ADMIN', 'MANAGER'), purchase.exportPurchases);
router.get('/purchases', authorize('ADMIN', 'MANAGER'), purchase.listPurchases);
router.get('/purchases/:id', authorize('ADMIN', 'MANAGER'), purchase.getPurchase);
router.post('/purchases', authorize('ADMIN', 'MANAGER'), validateBody(purchaseSchema), purchase.createPurchase);
router.put('/purchases/:id', authorize('ADMIN', 'MANAGER'), validateBody(purchaseUpdateSchema), purchase.updatePurchase);
router.delete('/purchases/:id', authorize('ADMIN', 'MANAGER'), purchase.deletePurchase);

router.get('/sales/export', authorize('ADMIN', 'MANAGER'), sales.exportSales);
router.get('/sales', authorize('ADMIN', 'MANAGER', 'STAFF'), sales.listSales);
router.get('/sales/:id', authorize('ADMIN', 'MANAGER', 'STAFF'), sales.getSale);
router.post('/sales', authorize('ADMIN', 'MANAGER', 'STAFF'), validateBody(salesSchema), sales.createSale);
router.put('/sales/:id', authorize('ADMIN', 'MANAGER'), sales.updateSale);
router.delete('/sales/:id', authorize('ADMIN', 'MANAGER'), sales.deleteSale);

router.get('/stock/export', authorize('ADMIN', 'MANAGER'), stock.exportStock);
router.get('/stock/movements', authorize('ADMIN', 'MANAGER'), stock.listMovements);
router.get('/stock', authorize('ADMIN', 'MANAGER', 'STAFF'), stock.listStock);
router.post('/stock/adjustment', authorize('ADMIN', 'MANAGER'), validateBody(stockAdjustmentSchema), stock.adjustStock);

router.get('/reports/sales', authorize('ADMIN', 'MANAGER'), report.salesReport);
router.get('/reports/purchases', authorize('ADMIN', 'MANAGER'), report.purchaseReport);
router.get('/reports/stock', authorize('ADMIN', 'MANAGER'), report.stockReport);
router.get('/reports/profit', authorize('ADMIN', 'MANAGER'), report.profitReport);
router.get('/reports/customer-outstanding', authorize('ADMIN', 'MANAGER'), report.customerOutstandingReport);
router.get('/reports/supplier-outstanding', authorize('ADMIN', 'MANAGER'), report.supplierOutstandingReport);
router.get('/reports/export/:type', authorize('ADMIN', 'MANAGER'), report.exportReport);

router.get('/users', authorize('ADMIN'), user.listUsers);
router.put('/users/:id', authorize('ADMIN'), validateBody(userUpdateSchema), user.updateUser);
router.delete('/users/:id', authorize('ADMIN'), user.deleteUser);

router.get('/settings', authorize('ADMIN', 'MANAGER'), settings.getSettings);
router.put('/settings', authorize('ADMIN'), validateBody(settingsSchema), settings.updateSettings);

export default router;
