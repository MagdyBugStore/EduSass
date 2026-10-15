import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Accounting from './pages/Accounting';
import Announcements from './pages/Announcements';
import Attendance from './pages/Attendance';
import Classes from './pages/Classes';
import Dashboard from './pages/Dashboard';
import Exams from './pages/Exams';
import Expenses from './pages/Expenses';
import Fees from './pages/Fees';
import HR from './pages/HR';
import { Login, Register } from './pages/Login';
import Payroll from './pages/Payroll';
import Platform from './pages/Platform';
import Reports from './pages/Reports';
import SettingsPage from './pages/Settings';
import StudentProfile from './pages/StudentProfile';
import MyClasses from './pages/MyClasses';
import ClassDetail from './pages/ClassDetail';
import SubjectDetail from './pages/SubjectDetail';
import Students from './pages/Students';
import TeacherProfile from './pages/TeacherProfile';
import Teachers from './pages/Teachers';
import TeacherHome from './pages/TeacherHome';
import Timetable from './pages/Timetable';
import Subscription from './pages/Subscription';
import UsersPage from './pages/Users';
import { useAuth } from './store/auth';
import { useEffect } from 'react';

export default function App() {
  const { me, loading, load } = useAuth();
  useEffect(() => { load(); }, [load]);
  if (loading) return <Spinner />;

  if (!me) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (me.role === 'parent') {
    return <div className="mx-auto mt-20 max-w-md card text-center">
      <h2 className="font-bold">حساب ولي أمر</h2>
      <p className="mt-2 text-sm text-pencil">استخدم تطبيق الموبايل لأولياء الأمور لمتابعة أبنائك.</p>
      <button className="btn-ghost mt-4" onClick={useAuth.getState().logout}>خروج</button>
    </div>;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        {me.role === 'superadmin' ? (
          <>
            <Route path="/platform" element={<Platform />} />
            <Route path="*" element={<Navigate to="/platform" replace />} />
          </>
        ) : (
          <>
            <Route index element={me.role === 'teacher' && me.school?.modules.includes('teacherPortal') ? <TeacherHome /> : <Dashboard />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/teachers" element={<Teachers />} />
            <Route path="/teachers/:id" element={<TeacherProfile />} />
            <Route path="/classes/:id" element={<ClassDetail />} />
            <Route path="/subjects/:id" element={<SubjectDetail />} />
            <Route path="/my-classes" element={<MyClasses />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/classes" element={<Classes />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/fees" element={<Fees />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/hr" element={<HR />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/subscription" element={<Subscription />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Route>
    </Routes>
  );
}
