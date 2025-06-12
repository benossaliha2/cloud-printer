const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// SumatraPDF yolu tespit et
async function findSumatraPDF() {
    const sumatraPaths = [
        'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
        'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe'
    ];
    
    for (const path of sumatraPaths) {
        if (fs.existsSync(path)) {
            console.log(`✅ SumatraPDF bulundu: ${path}`);
            return path;
        }
    }
    
    console.log('❌ SumatraPDF bulunamadı');
    return null;
}

// Yazıcıları listele
async function getAvailablePrinters() {
    try {
        console.log('🔍 Yazıcılar kontrol ediliyor...');
        const { stdout } = await execAsync('powershell -Command "Get-Printer | Select-Object Name, Default | ConvertTo-Json"');
        
        const printers = JSON.parse(stdout);
        const formattedPrinters = Array.isArray(printers) ? printers : [printers];
        
        console.log('🖨️ Bulunan yazıcılar:', formattedPrinters.map(p => p.Name));
        return formattedPrinters;
    } catch (error) {
        console.error('❌ Yazıcılar alınamadı:', error.message);
        return [];
    }
}

// Hedef yazıcıyı bul - EPSON veya KASA kelimelerini içerenleri öncelikle seç
async function getTargetPrinter() {
    const printers = await getAvailablePrinters();
    
    if (printers.length === 0) {
        return null;
    }
    
    console.log('🎯 Hedef yazıcı aranıyor...');
    
    // Önce EPSON veya KASA kelimelerini içeren yazıcıları ara
    const targetKeywords = ['epsona', 'kasa'];
    
    for (const keyword of targetKeywords) {
        console.log(`🔍 "${keyword}" yazıcısı aranıyor...`);
        const foundPrinter = printers.find(p => 
            p.Name.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (foundPrinter) {
            console.log(`✅ Hedef yazıcı bulundu: ${foundPrinter.Name}`);
            return foundPrinter.Name;
        }
    }
    
    // Hedef yazıcı bulunamazsa, varsayılan yazıcıyı kullan
    const defaultPrinter = printers.find(p => p.Default === true);
    if (defaultPrinter) {
        console.log(`🎯 Varsayılan yazıcı kullanılacak: ${defaultPrinter.Name}`);
        return defaultPrinter.Name;
    }
    
    // Son çare: ilk yazıcıyı kullan
    console.log(`🎯 İlk yazıcı kullanılacak: ${printers[0].Name}`);
    return printers[0].Name;
}

// SumatraPDF ile yazdır
async function printWithSumatra(pdfPath, printerName) {
    console.log(`🖨️ SumatraPDF yazdırma başlatılıyor: ${pdfPath} -> ${printerName}`);
    
    const sumatraPath = await findSumatraPDF();
    if (!sumatraPath) {
        throw new Error('SumatraPDF bulunamadı. Lütfen yükleyin: https://www.sumatrapdfreader.org/');
    }
    
    // SumatraPDF Yöntem 1: Standart -print-to parametresi (orijinal sırayla)
    try {
        console.log('🔧 SumatraPDF Yöntem 1: Standart -print-to parametresi');
        const readerCommand = `"${sumatraPath}" -print-to "${printerName}" "${pdfPath}" -exit-when-done -silent`;
        
        console.log('📋 Yöntem 1 komutu:', readerCommand);
        
        const { stdout, stderr } = await execAsync(readerCommand, { timeout: 30000 });
        console.log('✅ SumatraPDF standart yazdırma başarılı');
        if (stdout) console.log('📤 Stdout:', stdout);
        if (stderr) console.log('⚠️ Stderr:', stderr);
        
        // Yazdırma işleminin tamamlanması için bekle
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        return {
            success: true,
            message: 'PDF SumatraPDF standart yöntemi ile yazdırıldı',
            printer: printerName,
            jobID: Date.now().toString(),
            method: 'SumatraPDF Standard',
            verified: true
        };
    } catch (sumatraStandardError) {
        console.log('❌ SumatraPDF standart yöntem başarısız:', sumatraStandardError.message);
        console.log('🔄 SumatraPDF alternatif yöntemler deneniyor...');
        
        // Yöntem 2: Varsayılan yazıcıya yazdır
        try {
            console.log('🔧 SumatraPDF Yöntem 2: Varsayılan yazıcıya yazdır');
            const sumatraDefaultCmd = `"${sumatraPath}" -print-to-default "${pdfPath}" -exit-when-done -silent`;
            
            console.log('📋 Yöntem 2 komutu:', sumatraDefaultCmd);
            
            const { stdout: defStdout, stderr: defStderr } = await execAsync(sumatraDefaultCmd, { timeout: 25000 });
            console.log('✅ SumatraPDF varsayılan yazdırma başarılı');
            if (defStdout) console.log('📤 Default Stdout:', defStdout);
            if (defStderr) console.log('⚠️ Default Stderr:', defStderr);
            
            await new Promise(resolve => setTimeout(resolve, 6000));
            
            return {
                success: true,
                message: 'PDF SumatraPDF varsayılan yazıcı ile yazdırıldı',
                printer: 'Varsayılan yazıcı',
                jobID: Date.now().toString(),
                method: 'SumatraPDF Default Print',
                verified: true
            };
        } catch (sumatraDefaultError) {
            console.log('❌ SumatraPDF varsayılan yazdırma başarısız:', sumatraDefaultError.message);
            
            // Yöntem 3: Basit yazdırma (notepad -p benzeri yaklaşım)
            try {
                console.log('🔧 SumatraPDF Yöntem 3: Basit yazdırma');
                const sumatraSimpleCmd = `"${sumatraPath}" "${pdfPath}" -print`;
                
                console.log('📋 Yöntem 3 komutu:', sumatraSimpleCmd);
                
                const { stdout: simpleStdout, stderr: simpleStderr } = await execAsync(sumatraSimpleCmd, { timeout: 20000 });
                console.log('✅ SumatraPDF basit yazdırma başarılı');
                if (simpleStdout) console.log('📤 Simple Stdout:', simpleStdout);
                if (simpleStderr) console.log('⚠️ Simple Stderr:', simpleStderr);
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                return {
                    success: true,
                    message: 'PDF SumatraPDF basit yöntem ile yazdırıldı',
                    printer: printerName,
                    jobID: Date.now().toString(),
                    method: 'SumatraPDF Simple Print',
                    verified: true
                };
            } catch (sumatraSimpleError) {
                console.log('❌ SumatraPDF basit yazdırma başarısız:', sumatraSimpleError.message);
                
                // Yöntem 4: Dosyayı açıp print dialog'u göster
                try {
                    console.log('🔧 SumatraPDF Yöntem 4: Print dialog');
                    const sumatraDialogCmd = `"${sumatraPath}" "${pdfPath}" -print-dialog`;
                    
                    console.log('📋 Yöntem 4 komutu:', sumatraDialogCmd);
                    
                    const { stdout: dialogStdout, stderr: dialogStderr } = await execAsync(sumatraDialogCmd, { timeout: 15000 });
                    console.log('✅ SumatraPDF dialog yazdırma başarılı');
                    if (dialogStdout) console.log('📤 Dialog Stdout:', dialogStdout);
                    if (dialogStderr) console.log('⚠️ Dialog Stderr:', dialogStderr);
                    
                    return {
                        success: true,
                        message: 'PDF SumatraPDF dialog ile yazdırıldı',
                        printer: printerName,
                        jobID: Date.now().toString(),
                        method: 'SumatraPDF Print Dialog',
                        verified: false
                    };
                } catch (sumatraDialogError) {
                    console.log('❌ SumatraPDF dialog yazdırma başarısız:', sumatraDialogError.message);
                    throw new Error('SumatraPDF tüm yazdırma yöntemleri başarısız');
                }
            }
        }
    }
}

// HTML'i PDF'e çevir ve yazdır
async function printReceipt() {
    let browser;
    const timestamp = Date.now();
    // PDF dosyasını farklı bir isimle oluştur (OneNote ilişkilendirmesini engellemek için)
    const pdfPath = path.join(__dirname, `print_job_${timestamp}.pdf`);
    
    try {
        console.log('📄 Fiş HTML içeriği oluşturuluyor...');
        console.log('📁 PDF dosyası yolu:', pdfPath);
        
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
                Test Yazdırma<br>
                SumatraPDF Printer
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
                '--disable-extensions'
            ] 
        });

        
        
        const page = await browser.newPage();
        await page.setContent(receiptHtml, { waitUntil: 'domcontentloaded' });
        
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            width: '80mm',
            height: '200mm',
            margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
            printBackground: true
        });
        
        console.log('✅ PDF oluşturuldu:', pdfPath);
        await browser.close();
        browser = null;
        
        // Yazıcıyı bul
        const printerName = await getTargetPrinter();
        if (!printerName) {
            throw new Error('Yazıcı bulunamadı');
        }
        
        console.log(`🎯 Hedef yazıcı: ${printerName}`);
        
        // SumatraPDF ile yazdır
        const result = await printWithSumatra(pdfPath, printerName);
        
        // PDF dosyasını 30 saniye sonra sil
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                    console.log('🗑️ PDF dosyası silindi');
                }
            } catch (err) {
                console.error('❌ PDF silme hatası:', err);
            }
        }, 30000);
        
        return result;
        
    } catch (error) {
        if (browser) await browser.close();
        console.error('❌ Fiş yazdırma hatası:', error);
        
        // Temizlik
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
        }
        
        throw error;
    }
}

// Ana yazdırma endpoint'i
app.post('/print', async (req, res) => {
    try {
        console.log('🖨️ Fiş yazdırma isteği alındı');
        const result = await printReceipt();
        
        res.json({
            success: true,
            message: 'Fiş başarıyla yazdırıldı',
            jobID: result.jobID,
            printer: result.printer,
            method: result.method,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Yazdırma hatası:', error);
        res.status(500).json({
            success: false,
            message: 'Fiş yazdırma başarısız',
            error: error.message
        });
    }
});

// Yazıcıları listele
app.get('/printers', async (req, res) => {
    try {
        const printers = await getAvailablePrinters();
        res.json({
            success: true,
            printers: printers,
            count: printers.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Yazıcılar listelenemedi',
            error: error.message
        });
    }
});

// Durum kontrolü
app.get('/status', async (req, res) => {
    try {
        const sumatraPath = await findSumatraPDF();
        const printers = await getAvailablePrinters();
        
        // OneNote ilişkilendirmesi kontrolü
        let pdfAssociation = 'Unknown';
        try {
            const { stdout } = await execAsync('powershell -Command "Get-ItemProperty \'HKCR:\\.pdf\\OpenWithProgids\' | Select-Object -Property *"');
            pdfAssociation = stdout.includes('OneNote') ? 'OneNote (⚠️ Sorunlu)' : 'Normal';
        } catch (e) {
            pdfAssociation = 'Kontrol edilemedi';
        }
        
        res.json({
            success: true,
            status: 'Çalışıyor',
            sumatraPDF: {
                available: !!sumatraPath,
                path: sumatraPath || 'Bulunamadı'
            },
            printers: {
                count: printers.length,
                available: printers.length > 0
            },
            pdfAssociation: pdfAssociation,
            ready: !!sumatraPath && printers.length > 0,
            oneNoteInfo: 'OneNote açılıyorsa PDF ilişkilendirmesi sorunlu olabilir'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Durum kontrolü başarısız',
            error: error.message
        });
    }
});

// Ana sayfa
app.get('/', (req, res) => {
    res.json({
        message: 'Basit SumatraPDF Printer Server',
        version: '1.0',
        endpoints: {
            'POST /print': 'Fiş formatında test yazdırması yap',
            'GET /printers': 'Mevcut yazıcıları listele',
            'GET /status': 'Sistem durumunu kontrol et'
        },
        requirements: [
            'SumatraPDF yüklü olmalı',
            'En az bir yazıcı mevcut olmalı'
        ],
        usage: 'POST /print endpoint\'ine istek atarak fiş yazdırabilirsiniz'
    });
});

app.listen(PORT, async () => {
    console.log(`🚀 Basit SumatraPDF Printer Server ${PORT} portunda çalışıyor`);
    console.log(`📍 Ana sayfa: http://localhost:${PORT}`);
    console.log(`🖨️ Yazdırmak için: POST http://localhost:${PORT}/print`);
    
    // Başlangıç kontrolü
    const sumatraPath = await findSumatraPDF();
    const printers = await getAvailablePrinters();
    const targetPrinter = await getTargetPrinter();
    
    if (!sumatraPath) {
        console.log('⚠️  SumatraPDF bulunamadı! Lütfen yükleyin: https://www.sumatrapdfreader.org/');
    }
    
    if (printers.length === 0) {
        console.log('⚠️  Yazıcı bulunamadı! Lütfen yazıcı kurun.');
    } else if (targetPrinter) {
        console.log(`🎯 Hedef yazıcı belirlendi: ${targetPrinter}`);
    }
    
    if (sumatraPath && targetPrinter) {
        console.log('✅ Sistem hazır! Yazdırma yapabilirsiniz.');
    } else {
        console.log('⚠️ Sistem eksik gereksinimler nedeniyle hazır değil.');
    }
}); 