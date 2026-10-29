import { Route, Routes } from 'react-router'
import { PublicLayout } from './components/PublicLayout'
import { ScrollManager } from './components/ScrollManager'
import { AdminAccountPage } from './pages/admin/AdminAccountPage'
import { AdminContentPage } from './pages/admin/AdminContentPage'
import { AdminContractsPage } from './pages/admin/AdminContractsPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminDataPage } from './pages/admin/AdminDataPage'
import { AdminEstimateEditPage } from './pages/admin/AdminEstimateEditPage'
import { AdminEstimatesPage } from './pages/admin/AdminEstimatesPage'
import { AdminInquiriesPage } from './pages/admin/AdminInquiriesPage'
import { AdminInquiryDetailPage } from './pages/admin/AdminInquiryDetailPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminLogsPage } from './pages/admin/AdminLogsPage'
import { AdminMailPage } from './pages/admin/AdminMailPage'
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage'
import { AdminSpamPage } from './pages/admin/AdminSpamPage'
import { AdminThemePage } from './pages/admin/AdminThemePage'
import { EstimatePrintPage, ReceiptPrintPage } from './pages/admin/PrintPages'
import { ContactCompletePage } from './pages/ContactCompletePage'
import { ContactPage } from './pages/ContactPage'
import { HomePage } from './pages/HomePage'
import { LinePage } from './pages/LinePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TokushohoPage } from './pages/TokushohoPage'

export function App() {
  return (
    <>
      <ScrollManager />
      <Routes>
        {/* 公開サイト（管理画面で選んだテーマ色を反映） */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/contact/complete" element={<ContactCompletePage />} />
          <Route path="/line" element={<LinePage />} />
          <Route path="/tokushoho" element={<TokushohoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* 管理画面 */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/estimates/:id/print" element={<EstimatePrintPage />} />
        <Route path="/admin/payments/:id/receipt" element={<ReceiptPrintPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="inquiries" element={<AdminInquiriesPage />} />
          <Route path="inquiries/:id" element={<AdminInquiryDetailPage />} />
          <Route path="estimates" element={<AdminEstimatesPage />} />
          <Route path="estimates/:id" element={<AdminEstimateEditPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="contracts" element={<AdminContractsPage />} />
          <Route path="content" element={<AdminContentPage />} />
          <Route path="theme" element={<AdminThemePage />} />
          <Route path="mail" element={<AdminMailPage />} />
          <Route path="spam" element={<AdminSpamPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="data" element={<AdminDataPage />} />
          <Route path="account" element={<AdminAccountPage />} />
          <Route path="*" element={<NotFoundInAdmin />} />
        </Route>
      </Routes>
    </>
  )
}

function NotFoundInAdmin() {
  return <p className="admin-empty">ページが見つかりません。左のメニューから選んでください。</p>
}
