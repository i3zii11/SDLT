// ============================================
// إعدادات الربط مع Supabase (موحّدة لكل صفحات النظام)
// ============================================
var SUPABASE_URL = "https://pdonlejkordqblytufrf.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_GUjTm4RZk7u-GuzEjZm-Mg_neclTR6P";

// ⚠️ ملاحظة إصلاح: سابقاً كان المتغير معرّفاً باسم "supabase" بنفس اسم
// المكتبة العالمية القادمة من CDN، وهذا يسبب خطأ
// "Cannot access 'supabase' before initialization" ويمنع تحميل الصفحة بالكامل.
// تم تغيير الاسم إلى "db" ليتوافق مع باقي صفحات النظام (orders.html, branches.html).
var db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// اسم الفني المسجّل دخوله حالياً (تجريبي إلى حين ربط نظام Auth الفعلي)
const CURRENT_TECHNICIAN = "عبدالعزيز الفيفي";

// ============================================
// جلب الحالات الحية من السحاب وعرضها في جدول لوحة التحكم
// ============================================

// دالة تسجيل الخروج
async function logoutUser(event) {
    if (event) event.preventDefault(); // لمنع الصفحة من التحديث عند ضغط الرابط
    
    const { error } = await db.auth.signOut();
    
    if (error) {
        alert("حدث خطأ أثناء تسجيل الخروج: " + error.message);
    } else {
        // مسح الجلسة بنجاح والتوجه لصفحة الدخول
        window.location.href = 'login.html';
    }
}

async function enforceApproval() {
    // جلب اسم الصفحة الحالية بدقة
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const isAuthPage = currentPage === 'login.html' || currentPage === 'register.html';

    const { data: { session } } = await db.auth.getSession();
    
    if (!session) {
        if (!isAuthPage) window.location.href = 'login.html';
        return;
    }

    const { data: profile } = await db
        .from('profiles')
        .select('status, role')
        .eq('id', session.user.id)
        .single();

    if (profile && profile.status === 'pending') {
        await db.auth.signOut();
        if (!isAuthPage) window.location.href = 'login.html';
        return;
    }

    if (profile && profile.status === 'active') {
        // توجيه المفعل من صفحة الدخول للداشبورد
        if (isAuthPage) {
            window.location.href = 'index.html';
            return;
        }

        // ==========================================
        // --- هنا يبدأ سحر الصلاحيات (الأمان) ---
        // ==========================================

        // 1. صلاحيات المندوب
        if (profile.role === 'مندوب') {
            // اكتب هنا أسماء الصفحات الممنوعة على المندوب
            const forbiddenForRep = ['admin.html', 'index.html', 'clinics.html']; 
            
            if (forbiddenForRep.includes(currentPage)) {
                // إذا حاول فتح صفحة ممنوعة، اطرده لصفحة مسموحة (مثلاً صفحة تتبع الطلبات)
                window.location.href = 'orders.html'; 
            }
        }

        // 2. صلاحيات الدكتور
        if (profile.role === 'دكتور') {
            // الدكتور ممنوع من دخول صفحة الأدمن فقط
            const forbiddenForDoctor = ['admin.html']; 
            
            if (forbiddenForDoctor.includes(currentPage)) {
                window.location.href = 'index.html'; 
            }
        }

        // 3. إخفاء الروابط من القائمة الجانبية (UI)
        hideSidebarLinks(profile.role);
    }
}

// دالة لتنظيف القائمة الجانبية بناءً على الدور
function hideSidebarLinks(role) {
    // تنظيف الكلمة من أي مسافات قد تكون دخلت بالغلط في قاعدة البيانات
    const cleanRole = role.trim(); 
    
    console.log("=== فحص الصلاحيات للقائمة الجانبية ===");
    console.log("دور المستخدم الحالي هو: [" + cleanRole + "]");

    const adminLink = document.getElementById('adminNav');
    const dashboardLink = document.getElementById('dashboardNav');

    console.log("زر الأدمن موجود بالصفحة؟", adminLink ? "نعم" : "لا");
    console.log("زر الداشبورد موجود بالصفحة؟", dashboardLink ? "نعم" : "لا");

    if (cleanRole === 'مندوب') {
        if (adminLink) {
            adminLink.style.display = 'none'; // الطريقة الأولى
            adminLink.classList.add('hidden'); // الطريقة الثانية (الضربة القاضية لـ Tailwind)
            console.log("✅ تم إخفاء زر الأدمن بنجاح");
        }
        if (dashboardLink) {
            dashboardLink.style.display = 'none';
            dashboardLink.classList.add('hidden');
            console.log("✅ تم إخفاء زر الداشبورد بنجاح");
        }
    } 
    else if (cleanRole === 'دكتور') {
        if (adminLink) {
            adminLink.style.display = 'none';
            adminLink.classList.add('hidden');
        }
    }
}

// تشغيل الفحص
window.addEventListener('load', enforceApproval);

async function fetchAndRenderTickets() {
    const tableBody = document.getElementById('ticketsTableBody');
    if (!tableBody) return; // حماية في حال تم استدعاء الملف من صفحة لا تحتوي الجدول

    try {
        const { data: orders, error } = await db
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        tableBody.innerHTML = '';

        // إذا كان الجدول فارغاً في السحاب
        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">لا توجد طلبات نشطة حالياً في المعمل.</td></tr>`;
            updateDashboardStats(orders || []);
            return;
        }

        orders.forEach((order) => {
            let actionButton = '';
            if (order.is_locked) {
                actionButton = `<span class="text-xs text-slate-500 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">🔒 مقفلة بواسطة ${order.technician || 'غير معروف'}</span>`;
            } else {
                actionButton = `<button onclick="claimTicket(${order.id})" class="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border border-emerald-500/30 font-semibold px-4 py-1.5 rounded-lg text-xs transition-all">⚡ استلام الحالة (Claim)</button>`;
            }

            const row = `
                <tr class="hover:bg-slate-900/30 transition-all">
                    <td class="p-4 font-mono text-emerald-400">#${order.id}</td>
                    <td class="p-4">
                        <div class="font-medium text-white">${order.clinic || '-'}</div>
                        <div class="text-xs text-slate-500">${order.doctor || 'بدون اسم طبيب'}</div>
                    </td>
                    <td class="p-4 text-slate-300">${order.restoration_type || '-'}</td>
                    <td class="p-4"><span class="bg-slate-900 text-slate-300 border border-slate-800 text-xs px-2.5 py-1 rounded-full font-medium">${order.status || '-'}</span></td>
                    <td class="p-4 text-slate-400">${order.technician || '-'}</td>
                    <td class="p-4 text-center">${actionButton}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

        updateDashboardStats(orders);

    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-rose-500">حدث خطأ أثناء جلب البيانات من السحاب. حاول تحديث الصفحة.</td></tr>`;
    }
}

// ============================================
// تحديث بطاقات الإحصائيات العلوية في index.html بناءً على بيانات orders الحقيقية
// ============================================
function updateDashboardStats(orders) {
    const todayStr = new Date().toDateString();

    const todayOrders = orders.filter(o => o.created_at && new Date(o.created_at).toDateString() === todayStr);
    const pendingOrders = orders.filter(o => o.status !== 'مكتمل');
    const totalThisMonth = orders.filter(o => {
        if (!o.created_at) return false;
        const d = new Date(o.created_at);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    setStatIfExists('stat-today-orders', todayOrders.length);
    setStatIfExists('stat-pending-orders', pendingOrders.length);
    setStatIfExists('stat-total-orders', totalThisMonth.length);
}

// دالة مساعدة آمنة لتحديث عنصر إحصائي فقط إذا كان موجوداً في الصفحة
function setStatIfExists(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.innerText = value;
}

// ============================================
// قفل التذكرة وتحديثها حياً في السحاب باسم الفني الحالي
// ============================================
async function claimTicket(ticketId) {
    try {
        const { error } = await db
            .from('orders')
            .update({
                is_locked: true,
                technician: CURRENT_TECHNICIAN,
                status: "قيد الإنتاج الفعلي"
            })
            .eq('id', ticketId);

        if (error) throw error;

        fetchAndRenderTickets(); // إعادة جلب البيانات لتحديث الشاشة فوراً
    } catch (err) {
        alert("فشل قفل التذكرة، يرجى التحقق من الصلاحيات أو الاتصال.");
        console.error(err);
    }
}

// ============================================
// تشغيل ميزة الـ Realtime للاستماع للتغييرات فور حدوثها دون ريفريش
// ============================================
function setupRealtime() {
    db
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            console.log('تغيير حي في قاعدة البيانات!', payload);
            fetchAndRenderTickets();
        })
        .subscribe();
}

// دالة القائمة المنسدلة العامة
window.toggleDropdown = function(dropdownId, arrowId) {
    const dropdown = document.getElementById(dropdownId);
    const arrow = document.getElementById(arrowId);
    
    if (!dropdown) return; // تأمين في حال عدم وجود العنصر

    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        dropdown.classList.add('flex');
        if (arrow) arrow.style.transform = 'rotate(-90deg)';
    } else {
        dropdown.classList.add('hidden');
        dropdown.classList.remove('flex');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
};

// تفعيل القائمة تلقائياً إذا كنت في صفحة تابعة للمستخدمين
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.includes('users.html') || path.includes('roles.html') || path.includes('permissions.html')) {
        const dropdown = document.getElementById('usersDropdown');
        const arrow = document.getElementById('usersArrow');
        if (dropdown) {
            dropdown.classList.remove('hidden');
            dropdown.classList.add('flex');
            if (arrow) arrow.style.transform = 'rotate(-90deg)';
        }
    }
});

// ============================================
// التشغيل الأولي عند فتح الصفحة
// ============================================
window.onload = () => {
    fetchAndRenderTickets();
    setupRealtime();
};