const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Cloud-friendly PDF oluşturma (SumatraPDF olmadan)
async function generatePDF() {
    let browser;
    const timestamp = Date.now();
    const pdfPath = path.join('/tmp', `receipt_${timestamp}.pdf`);
    
    try {
        console.log('📄 Fiş HTML içeriği oluşturuluyor...');
        
        // Fiş formatında HTML içeriği
        const receiptHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: 'Courier New', monospace; 
                    font-size: 12pt; 
                    margin: 10mm; 
                    line-height: 1.2;
                    width: 70mm;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .line { border-top: 1px dashed #000; margin: 5px 0; }
                .total { font-size: 14pt; font-weight: bold; }
                @page { 
                    size: 80mm 200mm; 
                    margin: 5mm; 
                }
            </style>
        </head>
        <body>
            <div class="center bold">
                MARKET FİŞİ
            </div>
            <div class="line"></div>
            
            <div>Tarih: ${new Date().toLocaleDateString('tr-TR')}</div>
            <div>Saat: ${new Date().toLocaleTimeString('tr-TR')}</div>
            <div>Fiş No: ${timestamp}</div>
            
            <div class="line"></div>
            
            <div class="bold">ÜRÜNLER:</div>
            <div>Ekmek            x2    6.00 TL</div>
            <div>Süt 1Lt         x1   12.50 TL</div>
            <div>Domates 1Kg     x1   15.00 TL</div>
            <div>Peynir 500gr    x1   45.00 TL</div>
            
            <div class="line"></div>
            
            <div>Ara Toplam:         78.50 TL</div>
            <div>KDV (%18):          14.13 TL</div>
            
            <div class="line"></div>
            
            <div class="total center">
                TOPLAM: 92.63 TL
            </div>
            
            <div class="line"></div>
            
            <div class="center">
                Teşekkür Ederiz!<br>
                Cloud Printer Service<br>
                PDF Generator
            </div>
        </body>
        </html>`;
        
        console.log('🌐 PDF oluşturuluyor...');
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });
        
        const page = await browser.newPage();
        await page.setContent(receiptHtml, { waitUntil: 'domcontentloaded' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            width: '80mm',
            height: '200mm',
            margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
            printBackground: true
        });
        
        await browser.close();
        browser = null;
        
        console.log('✅ PDF oluşturuldu');
        
        return {
            success: true,
            pdfBuffer: pdfBuffer,
            timestamp: timestamp,
            message: 'PDF başarıyla oluşturuldu'
        };
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('❌ PDF oluşturma hatası:', error);
        throw error;
    }
}

// PDF oluşturma endpoint'i
app.post('/print', async (req, res) => {
    try {
        console.log('🖨️ PDF oluşturma isteği alındı');
        const result = await generatePDF();
        
        res.json({
            success: true,
            message: 'PDF başarıyla oluşturuldu',
            timestamp: new Date().toISOString(),
            jobID: result.timestamp.toString(),
            note: 'Cloud versiyonu - PDF oluşturuldu ancak fiziksel yazdırma yapılamaz'
        });
        
    } catch (error) {
        console.error('❌ PDF oluşturma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'PDF oluşturma başarısız',
            error: error.message
        });
    }
});

// PDF'i indirme endpoint'i
app.post('/download', async (req, res) => {
    try {
        console.log('📥 PDF indirme isteği alındı');
        const result = await generatePDF();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt_${result.timestamp}.pdf"`);
        res.send(result.pdfBuffer);
        
    } catch (error) {
        console.error('❌ PDF indirme hatası:', error);
        res.status(500).json({
            success: false,
            message: 'PDF indirme başarısız',
            error: error.message
        });
    }
});

// Özel HTML içeriği ile PDF oluşturma
app.post('/generate-pdf', async (req, res) => {
    const { html, options = {} } = req.body;
    
    if (!html) {
        return res.status(400).json({
            success: false,
            message: 'HTML içeriği gerekli'
        });
    }
    
    let browser;
    try {
        console.log('🌐 Özel HTML PDF oluşturuluyor...');
        
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        
        const pdfOptions = {
            format: options.format || 'A4',
            margin: options.margin || { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
            printBackground: true,
            ...options
        };
        
        const pdfBuffer = await page.pdf(pdfOptions);
        
        await browser.close();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="custom_${Date.now()}.pdf"`);
        res.send(pdfBuffer);
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('❌ Özel PDF oluşturma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'PDF oluşturma başarısız',
            error: error.message
        });
    }
});

// Durum kontrolü
app.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'Çalışıyor',
        environment: 'Cloud',
        puppeteer: 'Mevcut',
        features: {
            pdfGeneration: true,
            physicalPrinting: false,
            customHTML: true
        },
        endpoints: {
            'POST /print': 'Test fişi oluştur',
            'POST /download': 'Test fişi indir',
            'POST /generate-pdf': 'Özel HTML\'den PDF oluştur'
        },
        ready: true,
        note: 'Cloud versiyonu - PDF oluşturma mevcut, fiziksel yazdırma yok'
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.json({
        message: 'Cloud PDF Generator Service',
        version: '1.0-cloud',
        environment: 'Cloud-friendly',
        endpoints: {
            'POST /print': 'Test fişi oluştur',
            'POST /download': 'Test fişi PDF olarak indir', 
            'POST /generate-pdf': 'Özel HTML içeriğinden PDF oluştur',
            'GET /status': 'Sistem durumunu kontrol et'
        },
        usage: {
            testPrint: 'POST /print - Test fişi oluşturur',
            downloadPDF: 'POST /download - Test fişi PDF olarak indirir',
            customPDF: 'POST /generate-pdf - Özel HTML\'den PDF oluşturur'
        },
        note: 'Bu versiyon cloud platformlarda çalışır ancak fiziksel yazdırma yapmaz'
    });
});

// Test HTML sayfası
app.get('/test', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Cloud PDF Generator Test</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 600px; margin: 0 auto; }
            button { padding: 10px 20px; margin: 10px; background: #007bff; color: white; border: none; cursor: pointer; }
            .result { margin: 20px 0; padding: 10px; background: #f8f9fa; border: 1px solid #dee2e6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Cloud PDF Generator Test</h1>
            
            <button onclick="testPrint()">Test Fiş Oluştur</button>
            <button onclick="downloadPDF()">Test Fiş İndir</button>
            
            <div id="result" class="result" style="display:none;"></div>
            
            <h3>Özel HTML Test</h3>
            <textarea id="customHTML" rows="10" cols="60" placeholder="HTML içeriğinizi buraya yazın...">
<h1>Test Başlık</h1>
<p>Bu özel HTML içeriğidir.</p>
<ul>
    <li>Öğe 1</li>
    <li>Öğe 2</li>
</ul>
            </textarea><br>
            <button onclick="generateCustomPDF()">Özel PDF Oluştur</button>
        </div>
        
        <script>
            async function testPrint() {
                try {
                    const response = await fetch('/print', { method: 'POST' });
                    const data = await response.json();
                    document.getElementById('result').style.display = 'block';
                    document.getElementById('result').innerHTML = JSON.stringify(data, null, 2);
                } catch (error) {
                    alert('Hata: ' + error.message);
                }
            }
            
            async function downloadPDF() {
                try {
                    const response = await fetch('/download', { method: 'POST' });
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'test-receipt.pdf';
                    a.click();
                } catch (error) {
                    alert('Hata: ' + error.message);
                }
            }
            
            async function generateCustomPDF() {
                try {
                    const html = document.getElementById('customHTML').value;
                    const response = await fetch('/generate-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ html: html })
                    });
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'custom.pdf';
                    a.click();
                } catch (error) {
                    alert('Hata: ' + error.message);
                }
            }
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🚀 Cloud PDF Generator Service ${PORT} portunda çalışıyor`);
    console.log(`📍 Ana sayfa: http://localhost:${PORT}`);
    console.log(`🧪 Test sayfası: http://localhost:${PORT}/test`);
    console.log(`📋 Durum kontrolü: http://localhost:${PORT}/status`);
    console.log('✅ Cloud versiyonu hazır - PDF oluşturma mevcut');
}); 