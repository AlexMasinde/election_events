import * as puppeteer from 'puppeteer-core';
import { AppDataSource } from '../config/database';
import { Event } from '../entities/Event';
import { Participant } from '../entities/Participant';
import { CheckInLog } from '../entities/CheckInLog';
import { PollingCenter } from '../entities/PollingCenter';
import logger from '../config/logger';

export class PdfService {
  private static instance: PdfService;

  private constructor() {}

  public static getInstance(): PdfService {
    if (!PdfService.instance) {
      PdfService.instance = new PdfService();
    }
    return PdfService.instance;
  }

  // --- Helper Methods ---

  private async getLogoDataUrl(): Promise<string | null> {
    try {
      const logoUrl = 'https://state-checkin.nyc3.digitaloceanspaces.com/PHOTO-2024-05-20-11-51-31%206.jpg';
      
      const response = await fetch(logoUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/jpeg;base64,${base64}`;
      }
    } catch (error) {
      logger.warn('Could not load logo for PDF', { error });
    }
    return null;
  }

  private calculateAge(dateOfBirth: Date | string | null): number | null {
    if (!dateOfBirth) return null;
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  private getAgeGroup(age: number | null): string {
    if (age === null) return 'NOT STATED';
    if (age < 18) return 'Under 18';
    if (age >= 18 && age < 27) return '18-27';
    if (age >= 27 && age < 35) return '27-35';
    if (age >= 35 && age < 50) return '35-50';
    if (age >= 50 && age < 65) return '50-64';
    if (age >= 65) return '65+';
    return 'NOT STATED';
  }

  // --- Main Report Generation ---

  async generateEventReport(eventId: string): Promise<Buffer> {
    let browser;
    try {
      logger.info(`Starting PDF generation for event: ${eventId}`);

      // 1. Fetch Data
      const eventRepository = AppDataSource.getRepository(Event);
      const participantRepository = AppDataSource.getRepository(Participant);
      const checkInLogRepository = AppDataSource.getRepository(CheckInLog);
      const pollingCenterRepository = AppDataSource.getRepository(PollingCenter);

      const event = await eventRepository.findOne({ where: { eventId } });
      if (!event) throw new Error('Event not found');

      const participants = await participantRepository.find({
        where: { eventId },
      });

      const checkIns = await checkInLogRepository.find({
        where: { eventId },
        relations: ['participant'],
      });
      
      const checkedInParticipantIds = new Set(checkIns.map(c => c.participant.id));
      const checkedInParticipants = participants.filter(p => checkedInParticipantIds.has(p.id));

      // 2. Aggregate Data
      const checkedInCount = checkedInParticipants.length;
      
      const genderStats = checkedInParticipants.reduce((acc, p) => {
        const gender = p.sex || 'NOT STATED';
        acc[gender] = (acc[gender] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const ageStats = checkedInParticipants.reduce((acc, p) => {
        const age = this.calculateAge(p.dateOfBirth);
        const group = this.getAgeGroup(age);
        acc[group] = (acc[group] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);


      // Coverage Logic: Count Polling Centers
      // Determine what level to breakdown
      let groupByField: 'county' | 'constituency' | 'ward' | 'pollingCenter' = 'county';
      let pcGroupByField: keyof PollingCenter = 'county_name';
      let subjurisdictionLabel = 'County';

      // Determine scope and groupby
      const whereCondition: any = {};

      if (event.ward) {
        // Event is for a Ward -> Breakdown by Polling Center
        groupByField = 'pollingCenter';
        pcGroupByField = 'polling_center_name';
        subjurisdictionLabel = 'Polling Center';
        whereCondition.ward_name = event.ward;
        whereCondition.constituency_name = event.constituency; // strict check
      } else if (event.constituency) {
        // Event is for a Constituency -> Breakdown by Ward
        groupByField = 'ward';
        pcGroupByField = 'ward_name';
        subjurisdictionLabel = 'Ward';
        whereCondition.constituency_name = event.constituency;
      } else if (event.county) {
        // Event is for a County -> Breakdown by Constituency
        groupByField = 'constituency';
        pcGroupByField = 'constituency_name';
        subjurisdictionLabel = 'Constituency';
        whereCondition.county_name = event.county;
      } else {
         // National Event -> Breakdown by County
         groupByField = 'county';
         pcGroupByField = 'county_name';
         subjurisdictionLabel = 'County';
      }

      // Fetch ALL relevant Polling Centers for Total Counts
      const allPollingCenters = await pollingCenterRepository.find({ where: whereCondition });
      
      // Map: GroupName -> { totalCenters: number, activeCenters: Set<string> }
      const coverageMap = new Map<string, { total: number, active: Set<string> }>();

      // Init map with totals
      allPollingCenters.forEach(pc => {
        const groupKey = (pc[pcGroupByField] as string) || 'Unassigned';
        if (!coverageMap.has(groupKey)) {
            coverageMap.set(groupKey, { total: 0, active: new Set() });
        }
        coverageMap.get(groupKey)!.total++;
      });

      // Populate active centers from Checked In Participants
      checkedInParticipants.forEach(p => {
        // We need to map the participant to the same group key
        // Participant fields match the event fields usually (county, constituency, ward, pollingCenter)
        let groupKey = 'Unassigned';
        if (groupByField === 'pollingCenter') groupKey = p.pollingCenter || 'Unassigned';
        else if (groupByField === 'ward') groupKey = p.ward || 'Unassigned';
        else if (groupByField === 'constituency') groupKey = p.constituency || 'Unassigned';
        else if (groupByField === 'county') groupKey = p.county || 'Unassigned';
        
        // Count this participant's polling center as active for this group
        if (coverageMap.has(groupKey)) {
            if (p.pollingCenter) {
                coverageMap.get(groupKey)!.active.add(p.pollingCenter);
            }
        } else {
             // Participant might be from outside the strict event jurisdiction (e.g. guests), handle gracefully
             // or add if we want to show external attendees
             if (!coverageMap.has(groupKey)) {
                 coverageMap.set(groupKey, { total: 0, active: new Set() });
             }
             if (p.pollingCenter) coverageMap.get(groupKey)!.active.add(p.pollingCenter);
        }
      });

      const coverageData = Array.from(coverageMap.entries()).map(([name, stats]) => {
          return {
              name,
              total: stats.total, // Total Polling Centers
              active: stats.active.size, // Active Polling Centers (at least 1 checkin)
              rate: stats.total > 0 ? Math.round((stats.active.size / stats.total) * 100) : 0
          };
      }).sort((a, b) => b.active - a.active); // Sort by active count

      // Voter Registration Status
      const voterStats = participants.reduce((acc, p) => {
        // Only count Checked In participants
        if (!checkedInParticipantIds.has(p.id)) return acc;

        const isRegistered = !!p.county; // Heuristic: if they have county data, they are likley registered
        if (isRegistered) {
          acc.registered.checkedIn++;
        } else {
          acc.nonRegistered.checkedIn++;
        }
        return acc;
      }, {
        registered: { checkedIn: 0 },
        nonRegistered: { checkedIn: 0 }
      });

      // Calculate Overall Coverage
      // Use the sum of the breakdown coverage for consistency
      const totalActiveInScope = coverageData.reduce((sum, d) => sum + d.active, 0);
      const totalCentersInScope = coverageData.reduce((sum, d) => sum + d.total, 0);
      
      const overallCoverage = {
        active: totalActiveInScope,
        total: totalCentersInScope,
        rate: totalCentersInScope > 0 ? Math.round((totalActiveInScope / totalCentersInScope) * 100) : 0
      };
      const htmlContent = await this.generateHtml(
        event, 
        {
          checkedIn: checkedInCount,
          gender: genderStats,
          age: ageStats,
          subjurisdiction: { label: subjurisdictionLabel, data: coverageData },
          voterStatus: voterStats,
          coverage: overallCoverage
        }
      );

      // 4. Browserless PDF Generation
      logger.info('Connecting to Browserless...');
      const browserlessUrl = 'wss://production-sfo.browserless.io?token=2TWhMjjwY2OITnpf9f3886140c278370a3319ac18cb3aa3df';
      
      browser = await puppeteer.connect({ 
        browserWSEndpoint: browserlessUrl,
        defaultViewport: {
          width: 1200,
          height: 1600,
          deviceScaleFactor: 2, // High resolution for sharper charts
          isMobile: false
        }
      });

      const page = await browser.newPage();
      
      // Improve rendering reliability - use 'load' instead of 'networkidle0' to avoid race conditions
      await page.setContent(htmlContent, { 
        waitUntil: 'load',
        timeout: 60000 
      });
      
      // Wait for Chart.js animation
      await new Promise(r => setTimeout(r, 2000));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true, // Landscape for Dashboard view
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }, // Smaller margins for dashboard
      });

      logger.info('PDF successfully generated via Browserless');
      // cast to Buffer because puppeteer-core types might return Uint8Array
      return Buffer.from(pdfBuffer);

    } catch (error) {
      logger.error('PDF Generation Failed', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined 
      });
      throw error;
    } finally {
      if (browser) await browser.close();
    }
  }

  private async generateHtml(event: Event, stats: any): Promise<string> {
    const logoDataUrl = await this.getLogoDataUrl();
    const dateStr = new Date(event.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    
    // Modern Dashboard Palette
    const theme = {
      primary: '#0F172A',    // Slate 900 (Deep Dark Blue/Black)
      accent: '#10B981',     // Emerald 500 (Vibrant Green)
      secondary: '#F59E0B',  // Amber 500 (Gold)
      bg: '#F8FAFC',         // Slate 50 (Page Bg)
      cardBg: '#FFFFFF',
      text: '#334155',
      textLight: '#64748B',
      border: '#E2E8F0'
    };

    const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Event Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        body { 
            font-family: 'Inter', sans-serif; 
            margin: 0;
            padding: 20px;
            background-color: ${theme.bg};
            color: ${theme.text};
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Dashboard Grid */
        .dashboard {
            display: grid;
            grid-template-rows: auto auto 1fr;
            gap: 20px;
            max-width: 100%;
            height: 100%;
        }

        /* HEADER */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: ${theme.cardBg};
            padding: 15px 25px;
            border-radius: 12px;
            border: 1px solid ${theme.border};
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .header-left { display: flex; align-items: center; gap: 15px; }
        .logo { height: 40px; width: auto; object-fit: contain; }
        .event-title { font-size: 20px; font-weight: 800; color: ${theme.primary}; margin: 0; text-transform: uppercase; letter-spacing: -0.5px; }
        .event-meta { font-size: 12px; color: ${theme.textLight}; font-weight: 500; }
        .badge { 
            background: #EFF6FF; color: #3B82F6; 
            padding: 4px 8px; border-radius: 6px; 
            font-size: 11px; font-weight: 700; text-transform: uppercase; 
        }

        /* KPI CARDS ROW */
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
        }
        .kpi-card {
            background: ${theme.cardBg};
            border-radius: 12px;
            padding: 20px;
            border: 1px solid ${theme.border};
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            position: relative;
            overflow: hidden;
        }
        .kpi-card::after {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
        }
        .kpi-content { z-index: 1; }
        .kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: ${theme.textLight}; margin-bottom: 5px; }
        .kpi-value { font-size: 32px; font-weight: 800; color: ${theme.primary}; letter-spacing: -1px; }
        .kpi-sub { font-size: 12px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
        
        .kpi-attendance::after { background: ${theme.primary}; }
        .kpi-coverage::after { background: ${theme.accent}; }
        .kpi-voters::after { background: ${theme.secondary}; }

        /* MAIN CONTENT ROW (Charts + Table) */
        .content-row {
            display: grid;
            grid-template-columns: 400px 1fr; /* Sidebar Charts vs Main Table */
            gap: 20px;
            align-items: start;
        }

        /* CHART COLUMN */
        .charts-col {
            display: flex;
            flex-direction: column;
            gap: 20px;
            min-width: 0;
        }
        .chart-card {
            background: ${theme.cardBg};
            border-radius: 12px;
            padding: 15px;
            border: 1px solid ${theme.border};
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            overflow: hidden;
        }
        .card-header {
            font-size: 12px; font-weight: 700; color: ${theme.text}; 
            text-transform: uppercase; border-bottom: 1px solid ${theme.border};
            padding-bottom: 10px; margin-bottom: 10px;
            display: flex; justify-content: space-between;
        }

        /* TABLE SECTION */
        .table-card {
            background: ${theme.cardBg};
            border-radius: 12px;
            border: 1px solid ${theme.border};
            box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            overflow: hidden;
        }
        .table-header { padding: 15px 20px; border-bottom: 1px solid ${theme.border}; background: #FACC1510; } /* Slight yellow tint header */
        
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 12px 20px; font-weight: 600; color: ${theme.textLight}; background: ${theme.bg}; text-transform: uppercase; font-size: 10px; }
        td { padding: 12px 20px; border-bottom: 1px solid ${theme.border}; color: ${theme.text}; font-weight: 500; }
        tr:last-child td { border-bottom: none; }
        
        /* Progress Bar Modern */
        .prog-container { width: 100%; display: flex; align-items: center; gap: 10px; }
        .prog-bg { flex-grow: 1; height: 6px; background: ${theme.border}; border-radius: 3px; overflow: hidden; }
        .prog-val { height: 100%; background: ${theme.accent}; border-radius: 3px; }

    </style>
</head>
<body>

    <div class="dashboard">
        
        <!-- HEADER -->
        <div class="header">
            <div class="header-left">
                ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" />` : ''}
                <div>
                    <h1 class="event-title">${event.eventName}</h1>
                    <div class="event-meta">Created: ${dateStr} • ${event.county || 'National'} ${event.constituency ? ' • ' + event.constituency : ''}</div>
                </div>
            </div>
            <div class="badge">Analytics Report</div>
        </div>

        <!-- 3 KEY METRICS -->
        <div class="kpi-row">
            <!-- Card 1: Attendance -->
            <div class="kpi-card kpi-attendance">
                <div class="kpi-content">
                    <div class="kpi-label">Confirmed Attendance</div>
                    <div class="kpi-value">${formatNumber(stats.checkedIn)}</div>
                    <div class="kpi-sub" style="color: ${theme.textLight}">Participants Checked In</div>
                </div>
                <!-- Icon Placeholder -->
                <div style="font-size: 24px; opacity: 0.2">👥</div>
            </div>

            <!-- Card 2: Coverage -->
            <div class="kpi-card kpi-coverage">
                <div class="kpi-content">
                    <div class="kpi-label">Geographic Coverage</div>
                    <div class="kpi-value">${stats.coverage.rate}%</div>
                    <div class="kpi-sub" style="color: ${theme.accent}">
                        ${stats.coverage.active} / ${stats.coverage.total} Polling Centers
                    </div>
                </div>
                 <div style="font-size: 24px; opacity: 0.2">📍</div>
            </div>

            <!-- Card 3: Voter Reg -->
            <div class="kpi-card kpi-voters">
                <div class="kpi-content">
                    <div class="kpi-label">Voter Registration</div>
                    <div class="kpi-value">
                       ${Math.round((stats.voterStatus.registered.checkedIn / stats.checkedIn) * 100) || 0}%
                    </div>
                    <div class="kpi-sub" style="color: ${theme.secondary}">
                        ${formatNumber(stats.voterStatus.registered.checkedIn)} Registered
                    </div>
                </div>
                 <div style="font-size: 24px; opacity: 0.2">🗳️</div>
            </div>
        </div>

        <!-- MAIN CONTENT: CHARTS LEFT, TABLE RIGHT -->
        <div class="content-row">
            
            <!-- LEFT COLUMN: Charts -->
            <div class="charts-col">
                <!-- Gender -->
                <div class="chart-card">
                    <div class="card-header">
                        <span>Demographics</span>
                    </div>
                    <div style="height: 160px; position: relative;">
                        <!-- Flex container for side-by-side donuts -->
                         <div style="display: flex; height: 100%; width: 100%;">
                            <div style="flex:1; position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <div style="height: 120px; width: 100%; position: relative;">
                                    <canvas id="genderChart"></canvas>
                                </div>
                                <div style="text-align:center; font-size:10px; margin-top:5px; font-weight: 600;">Gender</div>
                            </div>
                            <div style="flex:1; position: relative; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <div style="height: 120px; width: 100%; position: relative;">
                                    <canvas id="voterChart"></canvas>
                                </div>
                                <div style="text-align:center; font-size:10px; margin-top:5px; font-weight: 600;">Voter Status</div>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: Coverage Table -->
            <div class="table-card">
                 <div class="table-header">
                    <div style="font-size: 14px; font-weight: 700; color: ${theme.primary};">
                        Polling Center Reach by ${stats.subjurisdiction.label}
                    </div>
                 </div>
                 <!-- Limit items to fit one page comfortably or let it overflow to page 2 naturally -->
                 <table>
                    <thead>
                        <tr>
                            <th>${stats.subjurisdiction.label} Name</th>
                            <th style="text-align: right">Coverage</th>
                            <th style="width: 40%">Saturation</th>
                        </tr>
                    </thead>
                    <tbody>
                         ${stats.subjurisdiction.data.slice(0, 12).map((d: any) => `
                        <tr>
                            <td>${d.name}</td>
                            <td style="text-align: right; font-family: monospace;">
                                <b>${d.active}</b> <span style="color:#94A3B8">/ ${d.total}</span>
                            </td>
                            <td>
                                <div class="prog-container">
                                    <div class="prog-bg">
                                        <div class="prog-val" style="width: ${d.rate}%"></div>
                                    </div>
                                    <div style="font-size: 10px; font-weight: 700; width: 30px; text-align: right;">${d.rate}%</div>
                                </div>
                            </td>
                        </tr>
                        `).join('')}
                    </tbody>
                 </table>
                 ${stats.subjurisdiction.data.length > 12 ? 
                    `<div style="padding: 10px 20px; font-size: 10px; color: ${theme.textLight}; text-align: center; border-top: 1px solid ${theme.border};">
                        + ${stats.subjurisdiction.data.length - 12} more regions (View full data export)
                    </div>` 
                 : ''}
            </div>

        </div>
    </div>

    <!-- PAGE 2: Age Distribution -->
    <div style="page-break-before: always; margin-top: 20px;">
        <div class="chart-card" style="height: 600px; padding: 30px;">
            <div class="card-header" style="font-size: 16px; padding-bottom: 20px;">
                Detailed Age Distribution
            </div>
            <div style="height: 500px; position: relative; width: 100%;">
                <canvas id="ageChart"></canvas>
            </div>
        </div>
    </div>

    <!-- Chart Config -->
    <script>
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = '${theme.textLight}';
        
        // Donut Config
        const donutConfig = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            layout: { padding: 10 },
            plugins: {
                legend: { 
                    display: true, 
                    position: 'bottom',
                    labels: { boxWidth: 8, padding: 10, font: { size: 10 } }
                },
                datalabels: { 
                    display: true,
                    color: '#FFFFFF',
                    font: { weight: 'bold', size: 11 },
                    formatter: (val) => val // Show the number
                } 
            }
        };

        // Gender
        new Chart(document.getElementById('genderChart'), {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(Object.keys(stats.gender))},
                datasets: [{
                    data: ${JSON.stringify(Object.values(stats.gender))},
                    backgroundColor: ['#0F172A', '#F59E0B'], // Dark vs Gold
                    borderWidth: 0
                }]
            },
            options: donutConfig
        });

        // Voter
        new Chart(document.getElementById('voterChart'), {
            type: 'doughnut',
            data: {
                labels: ['Registered', 'Other'],
                datasets: [{
                    data: [${stats.voterStatus.registered.checkedIn}, ${stats.voterStatus.nonRegistered.checkedIn}],
                    backgroundColor: ['#10B981', '#E2E8F0'], // Green vs Gray
                    borderWidth: 0
                }]
            },
            options: donutConfig
        });

        // Age Chart
        const ageLabels = ${JSON.stringify(Object.keys(stats.age))};
        const ageData = ${JSON.stringify(Object.values(stats.age))};

        // Fallback for empty age data
        if (ageLabels.length === 0) {
           // If no data, render a placeholder message instead of empty canvas
           const canvas = document.getElementById('ageChart');
           const ctx = canvas.getContext('2d');
           ctx.font = '12px Inter';
           ctx.fillStyle = '#94A3B8';
           ctx.textAlign = 'center';
           ctx.fillText('No age data available', canvas.width/2, canvas.height/2);
        } else {
            new Chart(document.getElementById('ageChart'), {
                type: 'bar',
                data: {
                    labels: ageLabels,
                    datasets: [{
                        data: ageData,
                        backgroundColor: '#0F172A',
                        borderRadius: 4,
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { 
                            color: '${theme.textLight}', anchor: 'end', align: 'top', offset: -5,
                            font: { weight: 'bold', size: 10 },
                            formatter: (val) => val > 0 ? val : ''
                        }
                    },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '${theme.textLight}' } },
                        y: { display: false, grid: { display: false } }
                    }
                },
                plugins: [ChartDataLabels]
            });
        }
    </script>
</body>
</html>
    `;
  }
}
