document.addEventListener('DOMContentLoaded', async () => {
    setupTabs();
    
    // Default olaraq cari ayı seçirik
    const now = new Date();
    const monthStr = now.toISOString().slice(0, 7); // YYYY-MM
    const monthInput = document.getElementById('detailMonthInput');
    if (monthInput) monthInput.value = monthStr;

    // Yeni funksiya: Maşınları dropdown-a yüklə
    await loadCarsForSelect();

    // Digər hesabatları yüklə (ilk tab aktivdirsə onun məlumatı yüklənsin)
    loadPopularityChart();
    loadProfitabilityReport();
    loadBestCustomersReport();
    loadOccupancyReport();
    loadGeneralStats();
    loadRevenueByBrandReport();
});

// --- TABLARIN İDARƏ EDİLMƏSİ ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-link');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Aktiv sinifləri təmizlə
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Kliklənəni aktiv et
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });
}

// =======================================================
// 1. YENİ: DETALLI AVTOMOBİL HESABATI (Single Car Report)
// =======================================================

async function loadCarsForSelect() {
    try {
        const res = await fetch('/api/cars');
        if (!res.ok) throw new Error('Maşın siyahısını çəkmək mümkün olmadı');
        
        const cars = await res.json();
        const select = document.getElementById('detailCarSelect');
        if (!select) return;

        select.innerHTML = '<option value="">-- Maşın seçin --</option>';
        cars.forEach(car => {
            const opt = document.createElement('option');
            opt.value = car.id;
            opt.textContent = `${car.brand} ${car.model} (${car.plate})`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
    }
}

async function loadDetailedCarReport() {
    const carId = document.getElementById('detailCarSelect').value;
    const month = document.getElementById('detailMonthInput').value;
    const resultDiv = document.getElementById('detailedReportResult');

    if (!carId || !month) {
        alert("Zəhmət olmasa maşın və ay seçin!");
        return;
    }

    try {
        const res = await fetch(`/api/reports/single-car-monthly?carId=${carId}&month=${month}`);
        if (!res.ok) throw new Error("Hesabatı çəkmək mümkün olmadı");
        
        const data = await res.json();
        const { financials, lists } = data;

        // A. Maliyyə Kartları
        document.getElementById('detRevenue').innerText = financials.revenue.toFixed(2) + ' AZN';
        document.getElementById('detExpense').innerText = financials.expense.toFixed(2) + ' AZN';
        document.getElementById('detFines').innerText = `${financials.finesPaid.toFixed(2)} / ${financials.finesTotal.toFixed(2)}`;
        document.getElementById('detNet').innerText = financials.netProfit.toFixed(2) + ' AZN';

        // B. Rezervasiyalar Cədvəli
        const resBody = document.getElementById('detResBody');
        resBody.innerHTML = '';
        if (lists.reservations.length === 0) {
            resBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#999;">Bu ay rezervasiya yoxdur</td></tr>';
        } else {
            lists.reservations.forEach(r => {
                const tr = document.createElement('tr');
                
                // Statusun vizual təyini
                let statusHtml = '';
                if (r.remaining <= 0.01) {
                    statusHtml = '<span class="badge badge-success">Tam Ödənilib</span>';
                } else if (r.totalPaid > 0) {
                    statusHtml = '<span class="badge badge-warning">Qismən</span>';
                } else {
                    statusHtml = '<span class="badge badge-danger">Ödənilməyib</span>';
                }

                tr.innerHTML = `
                    <td>${r.customerName}</td>
                    <td><small>${r.startDate.slice(0,10)} <br> ${r.endDate.slice(0,10)}</small></td>
                    <td>${r.daysCount}</td>
                    <td style="font-weight:bold;">${r.totalIncome.toFixed(2)}</td>
                    <td style="color:green;">${r.totalPaid.toFixed(2)}</td>
                    <td style="color:red; font-weight:bold;">${r.remaining.toFixed(2)}</td>
                    <td>${statusHtml}</td>
                `;
                resBody.appendChild(tr);
            });
        }

        // C. Xərclər Cədvəli
        const expBody = document.getElementById('detExpBody');
        expBody.innerHTML = '';
        if (lists.expenses.length === 0) {
            expBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">Xərc yoxdur</td></tr>';
        } else {
            lists.expenses.forEach(e => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${(e.when || e.createdAt).slice(0,10)}</td>
                    <td>${e.title || 'Digər'}</td>
                    <td style="color:red;">${e.amount}</td>
                `;
                expBody.appendChild(tr);
            });
        }

        // D. Cərimələr Cədvəli
        const fineBody = document.getElementById('detFineBody');
        fineBody.innerHTML = '';
        if (lists.fines.length === 0) {
            fineBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">Cərimə yoxdur</td></tr>';
        } else {
            lists.fines.forEach(f => {
                const tr = document.createElement('tr');
                const isPaidHtml = f.isPaid 
                    ? '<span style="color:green; font-size:0.8em;">✔ Ödəndi</span>' 
                    : '<span style="color:red; font-size:0.8em;">✖ Borc</span>';
                
                tr.innerHTML = `
                    <td>${f.date}</td>
                    <td>${f.reason}</td>
                    <td>${f.amount}</td>
                    <td>${isPaidHtml}</td>
                `;
                fineBody.appendChild(tr);
            });
        }

        // Nəticə panelini göstər
        resultDiv.style.display = 'block';

    } catch (error) {
        console.error(error);
        alert("Xəta baş verdi: " + error.message);
    }
}

// =======================================================
// 2. MÖVCUD HESABATLAR (Populyarlıq, Mənfəət və s.)
// =======================================================

// --- Maşın Populyarlığı Chart ---
async function loadPopularityChart() {
    try {
        const res = await fetch('/api/reports/car-popularity');
        const data = await res.json();
        
        const ctx = document.getElementById('carPopularityChart').getContext('2d');
        if (window.myPopularityChart) window.myPopularityChart.destroy();

        window.myPopularityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Rezervasiya Sayı',
                    data: data.data,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                }
            }
        });
    } catch (error) {
        console.error("Chart error:", error);
    }
}

// --- Mənfəətlilik Cədvəli ---
async function loadProfitabilityReport() {
    try {
        const res = await fetch('/api/reports/car-profitability');
        const data = await res.json();
        const tbody = document.querySelector('#profitabilityTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.carName}</td>
                <td style="color: green;">${item.totalRevenue.toFixed(2)} AZN</td>
                <td style="color: red;">${item.totalExpense.toFixed(2)} AZN</td>
                <td style="font-weight: bold;">${item.profit.toFixed(2)} AZN</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Profitability error:", error);
    }
}

// --- Ən Yaxşı Müştərilər ---
async function loadBestCustomersReport() {
    try {
        const res = await fetch('/api/reports/best-customers');
        const data = await res.json();
        const tbody = document.querySelector('#bestCustomersTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        data.slice(0, 10).forEach(item => { // Top 10
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.customerName}</td>
                <td>${item.rentalCount}</td>
                <td style="color: green; font-weight: bold;">${item.totalRevenue.toFixed(2)} AZN</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Best customers error:", error);
    }
}

// --- Doluluq Faizi ---
async function loadOccupancyReport() {
    try {
        const res = await fetch('/api/reports/occupancy');
        const data = await res.json();
        const tbody = document.querySelector('#occupancyTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        data.report.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.carName}</td>
                <td>${item.rentedDays} / ${data.daysInMonth}</td>
                <td>
                    <div style="background: #e0e0e0; border-radius: 4px; overflow: hidden; width: 100px; height: 20px; display: inline-block; vertical-align: middle;">
                        <div style="background: ${getColor(item.occupancyPercentage)}; width: ${item.occupancyPercentage}%; height: 100%;"></div>
                    </div>
                    <span style="margin-left: 10px;">${item.occupancyPercentage}%</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Occupancy error:", error);
    }
}

function getColor(percentage) {
    if (percentage < 30) return '#ef5350'; // Qırmızı
    if (percentage < 70) return '#ffca28'; // Sarı
    return '#66bb6a'; // Yaşıl
}

// --- Ümumi Statistika ---
async function loadGeneralStats() {
    try {
        const res = await fetch('/api/reports/average-duration');
        const data = await res.json();
        const el = document.getElementById('avgDuration');
        if(el) el.innerText = data.averageDuration + ' gün';
    } catch (error) {
        console.error("General stats error:", error);
    }
}

async function loadRevenueByBrandReport() {
    try {
        const res = await fetch('/api/reports/revenue-by-brand');
        const data = await res.json();
        const tbody = document.querySelector('#revenueByBrandTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.brand}</td>
                <td style="font-weight: bold; color: #1565c0;">${item.totalRevenue.toFixed(2)} AZN</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Revenue by brand error:", error);
    }
}