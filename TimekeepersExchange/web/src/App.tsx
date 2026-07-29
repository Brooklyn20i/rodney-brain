import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { PublicLayout, PortalLayout } from './components/layouts'
import { Home } from './pages/public/Home'
import { SellLanding, HowItWorks, ForBuyers, Trust, FeesPage } from './pages/public/Marketing'
import { About, Journal, Faq, Contact, Legal } from './pages/public/Misc'
import { SignIn, BuyerApply } from './pages/public/Auth'
import { SellerDashboard, SellerVerification } from './pages/seller/SellerDashboard'
import { SubmissionWizard } from './pages/seller/SubmissionWizard'
import { SubmissionDetail } from './pages/seller/SubmissionDetail'
import { BuyerDashboard, OpportunityFeed, BuyerOffers, BuyerAccount } from './pages/buyer/BuyerPages'
import { OpportunityDetail } from './pages/buyer/OpportunityDetail'
import { AdminDashboard, AdminBuyers, AdminDisputes, AdminAudit, AdminConfig, AdminWatches, AdminTransactions } from './pages/admin/AdminPages'
import { AdminWatchReview } from './pages/admin/AdminWatchReview'
import { WatchmakerQueue } from './pages/watchmaker/WatchmakerQueue'
import { InspectionForm } from './pages/watchmaker/InspectionForm'
import { TransactionPage, TransactionList } from './pages/shared/TransactionPage'
import { ReportPage } from './pages/shared/ReportPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/sell" element={<SellLanding />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/buyers" element={<ForBuyers />} />
          <Route path="/trust" element={<Trust />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/legal/:doc" element={<Legal />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/apply" element={<BuyerApply />} />
        </Route>

        <Route element={<PortalLayout role="seller" />}>
          <Route path="/seller" element={<SellerDashboard />} />
          <Route path="/seller/submit" element={<SubmissionWizard />} />
          <Route path="/seller/submissions/:id" element={<SubmissionDetail />} />
          <Route path="/seller/transactions" element={<TransactionList perspective="seller" />} />
          <Route path="/seller/transactions/:id" element={<TransactionPage perspective="seller" />} />
          <Route path="/seller/verification" element={<SellerVerification />} />
        </Route>

        <Route element={<PortalLayout role="buyer" />}>
          <Route path="/buyer" element={<BuyerDashboard />} />
          <Route path="/buyer/opportunities" element={<OpportunityFeed />} />
          <Route path="/buyer/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/buyer/offers" element={<BuyerOffers />} />
          <Route path="/buyer/transactions" element={<TransactionList perspective="buyer" />} />
          <Route path="/buyer/transactions/:id" element={<TransactionPage perspective="buyer" />} />
          <Route path="/buyer/account" element={<BuyerAccount />} />
        </Route>

        <Route element={<PortalLayout role="admin" />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/watches" element={<AdminWatches />} />
          <Route path="/admin/watches/:id" element={<AdminWatchReview />} />
          <Route path="/admin/buyers" element={<AdminBuyers />} />
          <Route path="/admin/transactions" element={<AdminTransactions />} />
          <Route path="/admin/transactions/:id" element={<TransactionPage perspective="admin" />} />
          <Route path="/admin/disputes" element={<AdminDisputes />} />
          <Route path="/admin/config" element={<AdminConfig />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
        </Route>

        <Route element={<PortalLayout role="watchmaker" />}>
          <Route path="/watchmaker" element={<WatchmakerQueue />} />
          <Route path="/watchmaker/inspections/:id" element={<InspectionForm />} />
        </Route>

        <Route path="/report/:inspectionId" element={<ReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
