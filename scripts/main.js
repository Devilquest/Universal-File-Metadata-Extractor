// Top-level constants: all visible strings in one place
const TEXTS = {
    binaryInformation: 'Binary Information',
    fileHeaderLabel: 'File header',
    experimentalPromptLabel: '[Exp] P.Text', //[Experimental] Prompt Text
    first16BytesLabel: 'First 16 bytes (hex)',
};

// List of keys to always consider "long", referencing TEXTS
const SPECIAL_KEYS = [
    TEXTS.fileHeaderLabel,
    TEXTS.experimentalPromptLabel,
    TEXTS.first16BytesLabel
];

class UniversalMetadataExtractor {
    constructor() {
        this.currentMetadata = null;
        this.currentFile = null;
        this.fileBuffer = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const downloadBtn = document.getElementById('downloadBtn');
        const downloadCsvBtn = document.getElementById('downloadCsvBtn');
        const clearBtn = document.getElementById('clearBtn');
        const scrollToTopBtn = document.getElementById('scrollToTopBtn');

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        downloadBtn.addEventListener('click', () => this.downloadJSON());
        downloadCsvBtn.addEventListener('click', () => this.downloadCSV());
        clearBtn.addEventListener('click', () => this.clearAll());

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Show/Hide "Go to Top" button
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                scrollToTopBtn.classList.add('show');
            } else {
                scrollToTopBtn.classList.remove('show');
            }
        });

        // Function to scroll to the top
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    async handleFile(file) {
        this.currentFile = file;
        this.showLoading();
        try {
            const metadata = await this.extractMetadata(file);
            this.displayMetadata(metadata);
            this.showFilePreview(file);
        } catch (error) {
            this.showError('Error extracting metadata: ' + error.message);
        }
    }

    showFilePreview(file) {
        const previewContainer = document.getElementById('filePreview');
        const fileIcon = this.getFileIcon(file.type);
        const fileSize = this.formatFileSize(file.size);

        let previewHTML = `
                    <div class="file-preview">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-info">
                            <div class="file-name">${this.escapeHtml(file.name)}</div>
                            <div class="file-size">${fileSize} • ${file.type || 'Unknown type'}</div>
                        </div>
                    </div>
                `;

        // Show image preview if it's an image
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewHTML += `<img src="${e.target.result}" class="image-preview" alt="Preview">`;
                previewContainer.innerHTML = previewHTML;
            };
            reader.readAsDataURL(file);
        } else {
            previewContainer.innerHTML = previewHTML;
        }
    }

    getFileIcon(mimeType) {
        if (!mimeType) return '📄';

        const typeMap = {
            'image': '🖼️',
            'video': '🎬',
            'audio': '🎵',
            'application/pdf': '📕',
            'application/zip': '📦',
            'application/x-rar': '📦',
            'application/x-7z': '📦',
            'text': '📝',
            'application/msword': '📘',
            'application/vnd.ms-excel': '📊',
            'application/vnd.ms-powerpoint': '📙',
            'application/json': '{ }',
            'application/xml': '< >',
            'application/javascript': '📜',
            'font': '🔤'
        };

        for (const [key, icon] of Object.entries(typeMap)) {
            if (mimeType.includes(key)) return icon;
        }

        const mainType = mimeType.split('/')[0];
        return typeMap[mainType] || '📄';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async extractMetadata(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    this.fileBuffer = e.target.result;
                    const metadata = this.parseFileMetadata(file, this.fileBuffer);
                    resolve(metadata);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsArrayBuffer(file);
        });
    }

    async parseFileMetadata(file, arrayBuffer) {
        const metadata = {
            'File Information': {
                'Name': file.name,
                'Size': this.formatFileSize(file.size),
                'Size (bytes)': file.size.toString(),
                'Type': file.type || 'Unknown',
                'Last Modified': new Date(file.lastModified).toLocaleString(),
                'Last Modified (timestamp)': file.lastModified.toString()
            }
        };

        const view = new DataView(arrayBuffer);

        // File signature detection
        const signature = this.detectFileSignature(view);
        if (signature) {
            metadata['File Information']['Detected Format'] = signature;
        }

        // Type-specific parsing
        if (file.type.startsWith('image/') || signature?.includes('Image')) {
            Object.assign(metadata, this.parseImageMetadata(view, file.type));
        } else if (file.type.startsWith('audio/') || signature?.includes('Audio')) {
            Object.assign(metadata, this.parseAudioMetadata(view));
        } else if (file.type.startsWith('video/') || signature?.includes('Video')) {
            Object.assign(metadata, this.parseVideoMetadata(view));
        } else if (file.type === 'application/pdf' || signature === 'PDF Document') {
            Object.assign(metadata, this.parsePDFMetadata(view));
        } else if (file.type.includes('zip') || signature?.includes('Archive')) {
            Object.assign(metadata, this.parseArchiveMetadata(view, signature));
        }

        // Add hex preview
        metadata[TEXTS.binaryInformation] = {
            [TEXTS.first16BytesLabel]: this.getHexString(view, 0, 16),
            [TEXTS.fileHeaderLabel]: this.getFileHeaderInfo(view)
        };

        return metadata;
    }

    detectFileSignature(view) {
        if (view.byteLength < 4) return null;

        const signatures = {
            '89504E47': 'PNG Image',
            'FFD8FF': 'JPEG Image',
            '47494638': 'GIF Image',
            '424D': 'BMP Image',
            '49492A00': 'TIFF Image (Little Endian)',
            '4D4D002A': 'TIFF Image (Big Endian)',
            '52494646': 'RIFF (WAV/AVI/WebP)',
            '504B0304': 'ZIP Archive',
            '504B0506': 'ZIP Archive (empty)',
            '504B0708': 'ZIP Archive (spanned)',
            '52617221': 'RAR Archive',
            '377ABCAF': '7-Zip Archive',
            '25504446': 'PDF Document',
            '4F676753': 'OGG Media',
            '494433': 'MP3 with ID3',
            'FFFB': 'MP3 Audio',
            '664C6143': 'FLAC Audio',
            '00000018': 'MP4 Video',
            '00000020': 'MP4 Video',
            '1A45DFA3': 'MKV Video',
            '3C3F786D': 'XML Document',
            '7B': 'JSON (possible)',
            '5B': 'JSON Array (possible)',
            'CAFEBABE': 'Java Class',
            '4D5A': 'Windows Executable',
            '7F454C46': 'Linux Executable (ELF)',
            'D0CF11E0': 'Microsoft Office (OLE)'
        };

        // Check signatures
        for (const [sig, format] of Object.entries(signatures)) {
            const sigBytes = sig.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
            let match = true;

            for (let i = 0; i < sigBytes.length && i < view.byteLength; i++) {
                if (view.getUint8(i) !== sigBytes[i]) {
                    match = false;
                    break;
                }
            }

            if (match) return format;
        }

        return null;
    }

    parseImageMetadata(view, mimeType) {
        const metadata = {};

        // PNG
        if (this.isPNG(view)) {
            const pngData = this.parsePNGChunks(view);
            if (Object.keys(pngData).length > 0) {
                metadata['PNG Metadata'] = pngData;
            }

            // Basic dimensions
            if (view.byteLength >= 24) {
                metadata['Image Dimensions'] = {
                    'Width': view.getUint32(16) + ' pixels',
                    'Height': view.getUint32(20) + ' pixels'
                };
            }
        }

        // JPEG
        else if (this.isJPEG(view)) {
            const jpegData = this.parseJPEGSegments(view);
            if (Object.keys(jpegData).length > 0) {
                metadata['JPEG Metadata'] = jpegData;
            }
        }

        // GIF
        else if (this.isGIF(view)) {
            if (view.byteLength >= 10) {
                metadata['GIF Information'] = {
                    'Version': this.getString(view, 3, 3),
                    'Width': view.getUint16(6, true) + ' pixels',
                    'Height': view.getUint16(8, true) + ' pixels'
                };
            }
        }

        // WebP
        else if (this.isWebP(view)) {
            metadata['WebP Information'] = {
                'Format': 'WebP Image',
                'File Size': view.byteLength + ' bytes'
            };
        }

        return metadata;
    }

    parseAudioMetadata(view) {
        const metadata = {};

        // Check for ID3 tags (MP3)
        if (view.byteLength >= 10 && this.getString(view, 0, 3) === 'ID3') {
            const id3Data = this.parseID3Tags(view);
            if (Object.keys(id3Data).length > 0) {
                metadata['ID3 Tags'] = id3Data;
            }
        }

        // FLAC
        else if (view.byteLength >= 4 && this.getString(view, 0, 4) === 'fLaC') {
            metadata['FLAC Information'] = {
                'Format': 'FLAC Audio',
                'Lossless': 'Yes'
            };
        }

        // WAV
        else if (view.byteLength >= 44 && this.getString(view, 0, 4) === 'RIFF') {
            const wavData = this.parseWAVHeader(view);
            if (Object.keys(wavData).length > 0) {
                metadata['WAV Information'] = wavData;
            }
        }

        return metadata;
    }

    parseVideoMetadata(view) {
        const metadata = {};

        // MP4/MOV
        if (view.byteLength >= 8) {
            const ftyp = this.getString(view, 4, 4);
            if (ftyp === 'ftyp') {
                metadata['Video Information'] = {
                    'Format': 'MP4/MOV',
                    'Brand': this.getString(view, 8, 4)
                };
            }
        }

        // AVI
        else if (this.getString(view, 0, 4) === 'RIFF' && view.byteLength >= 12) {
            const format = this.getString(view, 8, 4);
            if (format === 'AVI ') {
                metadata['Video Information'] = {
                    'Format': 'AVI Video',
                    'Container': 'RIFF'
                };
            }
        }

        // MKV
        else if (view.byteLength >= 4 && view.getUint32(0) === 0x1A45DFA3) {
            metadata['Video Information'] = {
                'Format': 'Matroska Video (MKV)',
                'Container': 'EBML'
            };
        }

        return metadata;
    }

    parsePDFMetadata(view) {
        const metadata = {};

        if (view.byteLength >= 1024) {
            const header = this.getString(view, 0, 1024);

            // Extract PDF version
            const versionMatch = header.match(/%PDF-(\d\.\d)/);
            if (versionMatch) {
                metadata['PDF Information'] = {
                    'Version': versionMatch[1],
                    'Format': 'Portable Document Format'
                };
            }

            // Look for basic metadata
            const titleMatch = header.match(/\/Title\s*\((.*?)\)/);
            const authorMatch = header.match(/\/Author\s*\((.*?)\)/);
            const creatorMatch = header.match(/\/Creator\s*\((.*?)\)/);

            if (titleMatch || authorMatch || creatorMatch) {
                metadata['PDF Metadata'] = {};
                if (titleMatch) metadata['PDF Metadata']['Title'] = titleMatch[1];
                if (authorMatch) metadata['PDF Metadata']['Author'] = authorMatch[1];
                if (creatorMatch) metadata['PDF Metadata']['Creator'] = creatorMatch[1];
            }
        }

        return metadata;
    }

    parseArchiveMetadata(view, signature) {
        const metadata = {
            'Archive Information': {
                'Type': signature || 'Archive',
                'Compressed': 'Yes'
            }
        };

        // ZIP specific
        if (signature?.includes('ZIP')) {
            metadata['Archive Information']['Format'] = 'ZIP';

            // Try to count files (basic approach)
            let fileCount = 0;
            for (let i = 0; i < view.byteLength - 4; i++) {
                if (view.getUint32(i) === 0x504B0304) {
                    fileCount++;
                }
            }
            if (fileCount > 0) {
                metadata['Archive Information']['Approximate Files'] = fileCount.toString();
            }
        }

        return metadata;
    }

    parsePNGChunks(view) {
        const metadata = {};
        let offset = 8; // Skip PNG signature

        while (offset < view.byteLength - 8) {
            const length = view.getUint32(offset);
            const type = this.getString(view, offset + 4, 4);

            if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
                const textData = new Uint8Array(view.buffer, offset + 8, length);
                const textStr = new TextDecoder('utf-8').decode(textData);
                if (type === 'tEXt') {
                    const nullIndex = textStr.indexOf('\0');
                    if (nullIndex !== -1) {
                        const key = textStr.substring(0, nullIndex);
                        const value = textStr.substring(nullIndex + 1);
                        metadata[key] = value;
                    }
                } else if (type === 'iTXt') {
                    const parts = textStr.split('\0');
                    if (parts.length >= 2) {
                        metadata[parts[0]] = parts[parts.length - 1];
                    }
                }
            }

            offset += 12 + length; // 4 bytes length + 4 bytes type + data + 4 bytes CRC

            if (type === 'IEND') break;
        }

        // Basic image info
        if (offset >= 16) {
            const width = view.getUint32(16);
            const height = view.getUint32(20);
            metadata['Image Width'] = width.toString();
            metadata['Image Height'] = height.toString();
            metadata['Image Size'] = `${width}x${height}`;
        }

        const finalMetadata = this.buildNewMetadata(metadata, this.extractTextsFromJSON(metadata.prompt));

        return finalMetadata || metadata;
    }

    //------------------------------------------------------------------------------------------------------------ Experimental
    buildNewMetadata(metadata, extractedPrompts) {
        // If no prompts, return null to indicate "use original metadata"
        if (!extractedPrompts || extractedPrompts.length === 0) {
            return null;
        }

        const newMetadata = {};

        // Add extracted prompts
        for (let i = 0; i < extractedPrompts.length; i++) {
            const prompt = extractedPrompts[i];
            newMetadata[TEXTS.experimentalPromptLabel + ` - ${i + 1}`] = prompt;
        }

        // Merge original metadata
        for (const key in metadata) {
            newMetadata[key] = metadata[key];
        }

        return newMetadata;
    }

    extractTextsFromJSON(jsonString) {
        const results = [];
        try {
            const parsed = JSON.parse(jsonString);
            for (const nodeId in parsed) {
                const node = parsed[nodeId];
                if (node && node.class_type) {
                    const classType = node.class_type;
                    if (classType.includes("CLIPTextEncode") || classType.includes("TextBox")) {
                        const texts = [node.inputs?.text, node.inputs?.text1];
                        texts.forEach(value => {
                            if (value && value.length > 3) {
                                results.push(value);
                            }
                        });
                    }
                }
            }
        } catch (e) {
            // Ignore non-JSON values
        }
        return results;
    }
    //------------------------------------------------------------------------------------------------------------ Experimental

    parseJPEGSegments(view) {
        const metadata = {};
        let offset = 2;

        while (offset < view.byteLength - 2) {
            const marker = view.getUint16(offset);

            if ((marker & 0xFF00) !== 0xFF00) break;

            const markerType = marker & 0x00FF;
            offset += 2;

            if (markerType === 0xE1) { // APP1 - EXIF data
                const length = view.getUint16(offset);
                const exifData = new Uint8Array(view.buffer, offset + 2, length - 2);

                // Try to extract basic EXIF data
                const exifString = new TextDecoder('utf-8', { ignoreBOMString: true }).decode(exifData);

                // Look for common AI data
                if (exifString.includes('parameters') || exifString.includes('prompt')) {
                    const lines = exifString.split('\n');
                    lines.forEach(line => {
                        if (line.includes(':')) {
                            const [key, ...values] = line.split(':');
                            const value = values.join(':').trim();
                            if (key.trim() && value) {
                                metadata[key.trim()] = value;
                            }
                        }
                    });
                }

                offset += length;
            } else if (markerType >= 0xE0 && markerType <= 0xEF) {
                // Other application segments
                const length = view.getUint16(offset);
                offset += length;
            } else if (markerType === 0xC0 || markerType === 0xC2) {
                // SOF - Start of Frame
                const length = view.getUint16(offset);
                if (length >= 8) {
                    const height = view.getUint16(offset + 3);
                    const width = view.getUint16(offset + 5);
                    metadata['Image Width'] = width.toString();
                    metadata['Image Height'] = height.toString();
                    metadata['Image Size'] = `${width}x${height}`;
                }
                offset += length;
            } else {
                break;
            }
        }

        return metadata;
    }

    parseID3Tags(view) {
        const tags = {};

        try {
            const version = view.getUint8(3);
            tags['ID3 Version'] = `2.${version}`;

            let offset = 10;
            const tagSize = this.getSynchsafeInt(view, 6);
            const maxOffset = Math.min(offset + tagSize, view.byteLength);

            while (offset < maxOffset - 10) {
                const frameId = this.getString(view, offset, 4);
                if (!frameId.match(/^[A-Z0-9]{4}$/)) break;

                const frameSize = view.getUint32(offset + 4);
                if (frameSize === 0 || frameSize > maxOffset - offset - 10) break;

                const frameData = new Uint8Array(view.buffer, offset + 10, Math.min(frameSize, 100));
                const frameText = new TextDecoder('utf-8', { fatal: false }).decode(frameData);

                const frameNames = {
                    'TIT2': 'Title',
                    'TPE1': 'Artist',
                    'TALB': 'Album',
                    'TYER': 'Year',
                    'TCON': 'Genre'
                };

                if (frameNames[frameId]) {
                    tags[frameNames[frameId]] = frameText.replace(/\0/g, '').substring(0, 100);
                }

                offset += 10 + frameSize;
            }
        } catch (e) {
            // Silently fail
        }

        return tags;
    }

    parseWAVHeader(view) {
        const wavData = {};

        try {
            if (view.byteLength >= 44) {
                const format = this.getString(view, 8, 4);
                if (format === 'WAVE') {
                    wavData['Format'] = 'WAV Audio';
                    wavData['Channels'] = view.getUint16(22, true).toString();
                    wavData['Sample Rate'] = view.getUint32(24, true) + ' Hz';
                    wavData['Bit Depth'] = view.getUint16(34, true) + ' bits';

                    const byteRate = view.getUint32(28, true);
                    wavData['Bitrate'] = Math.round(byteRate * 8 / 1000) + ' kbps';
                }
            }
        } catch (e) {
            // Silently fail
        }

        return wavData;
    }

    getFileHeaderInfo(view) {
        const maxBytes = Math.min(view.byteLength, 256);
        let ascii = '';

        for (let i = 0; i < maxBytes; i++) {
            const byte = view.getUint8(i);
            if (byte >= 32 && byte <= 126) {
                ascii += String.fromCharCode(byte);
            } else {
                ascii += '.';
            }
        }

        return ascii.substring(0, 100);
    }

    getHexString(view, start, length) {
        let hex = '';
        const end = Math.min(start + length, view.byteLength);

        for (let i = start; i < end; i++) {
            hex += view.getUint8(i).toString(16).padStart(2, '0').toUpperCase() + ' ';
        }

        return hex.trim();
    }

    getSynchsafeInt(view, offset) {
        return (view.getUint8(offset) << 21) |
            (view.getUint8(offset + 1) << 14) |
            (view.getUint8(offset + 2) << 7) |
            view.getUint8(offset + 3);
    }

    isPNG(view) {
        return view.byteLength >= 8 &&
            view.getUint32(0) === 0x89504E47 &&
            view.getUint32(4) === 0x0D0A1A0A;
    }

    isJPEG(view) {
        return view.byteLength >= 2 && view.getUint16(0) === 0xFFD8;
    }

    isGIF(view) {
        return view.byteLength >= 6 && this.getString(view, 0, 3) === 'GIF';
    }

    isWebP(view) {
        return view.byteLength >= 12 &&
            this.getString(view, 0, 4) === 'RIFF' &&
            this.getString(view, 8, 4) === 'WEBP';
    }

    getString(view, offset, length) {
        let str = '';
        for (let i = 0; i < length && offset + i < view.byteLength; i++) {
            str += String.fromCharCode(view.getUint8(offset + i));
        }
        return str;
    }

    displayMetadata(metadata) {
        this.currentMetadata = metadata;
        const container = document.getElementById('metadataContainer');
        container.style.display = 'block';

        uploadArea.style.display = 'none';

        // Update stats
        this.updateStats(metadata);

        // Update formatted view
        this.updateFormattedView(metadata);

        // Update raw JSON view
        this.updateRawView(metadata);

        // Update hex view
        this.updateHexView();
    }

    updateStats(metadata) {
        const stats = document.getElementById('metadataStats');
        let totalFields = 0;
        let categories = 0;

        for (const category in metadata) {
            categories++;
            if (typeof metadata[category] === 'object') {
                totalFields += Object.keys(metadata[category]).length;
            } else {
                totalFields++;
            }
        }

        stats.innerHTML = `
                    <div class="stat-item">
                        <div class="stat-value">${totalFields}</div>
                        <div class="stat-label">Total Fields</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${categories}</div>
                        <div class="stat-label">Categories</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${this.currentFile.name.split('.').pop().toUpperCase()}</div>
                        <div class="stat-label">Extension</div>
                    </div>
                `;
    }

    updateFormattedView(metadata) {
        const content = document.getElementById('metadataContent');
        let html = '';

        // Map of categories to custom emojis
        const categoryEmojis = {
            'File Information': '📄',
            'PNG Metadata': '🖼️',
            'JPG Metadata': '🖼️',
            'Image Dimensions': '📏',
            'Binary Information': '👾',
            'Video Information': '🎬',
            'Archive Information': '🗂️'
        };

        for (const [category, data] of Object.entries(metadata)) {
            // Determine emoji: use mapped emoji or fallback
            const emoji = categoryEmojis[category] || '📁';

            html += `
                        <h3 style="color: #ffffff; margin: 20px 0 15px 0; font-size: 1.2rem;">
                            ${emoji} ${this.escapeHtml(category)}
                        </h3>
                        <table class="metadata-table">
                            <tbody>
                    `;

            if (typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    const isLong = (value && value.length > 100) || SPECIAL_KEYS.includes(key);
                    html += `
                                <tr>
                                    <td class="metadata-key">${this.formatKey(key)}</td>
                                    <td class="metadata-value">
                                        <div ${isLong ? 'class="long-value"' : ''}>${this.escapeHtml(value)}</div>
                                    </td>
                                    <td class="metadata-copy-btn">
                                        <button class="copy-btn" data-value='${this.escapeHtml(value).replace(/'/g, "&#39;")}' onclick="extractor.copyToClipboard(this.dataset.value, this)">
                                            Copy
                                        </button>
                                    </td>
                                </tr>
                            `;
                }
            } else {
                html += `
                            <tr>
                                <td class="metadata-value" colspan="3">${this.escapeHtml(data)}</td>
                            </tr>
                        `;
            }

            html += '</tbody></table>';
        }

        content.innerHTML = html;
    }

    updateRawView(metadata) {
        const rawContent = document.getElementById('rawContent');
        rawContent.textContent = JSON.stringify(metadata, null, 2);
    }

    updateHexView() {
        const hexContent = document.getElementById('hexContent');
        const view = new DataView(this.fileBuffer);
        const maxBytes = Math.min(512, view.byteLength);
        let hexString = '';
        let asciiString = '';

        for (let i = 0; i < maxBytes; i += 16) {
            hexString += i.toString(16).padStart(8, '0').toUpperCase() + '  ';
            asciiString = '';

            for (let j = 0; j < 16 && i + j < maxBytes; j++) {
                const byte = view.getUint8(i + j);
                hexString += byte.toString(16).padStart(2, '0').toUpperCase() + ' ';

                if (j === 7) hexString += ' ';

                asciiString += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
            }

            hexString = hexString.padEnd(59, ' ');
            hexString += '  |' + asciiString + '|\n';
        }

        hexContent.textContent = hexString;
    }

    copyToClipboard(text, button) {
        navigator.clipboard.writeText(text).then(() => {
            button.classList.add('copied');
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.classList.remove('copied');
                button.textContent = 'Copy';
            }, 2000);
        });
    }

    downloadJSON() {
        if (!this.currentMetadata) return;

        const json = JSON.stringify(this.currentMetadata, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentFile.name}_metadata.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    downloadCSV() {
        if (!this.currentMetadata) return;

        let csv = 'Category,Field,Value\n';

        for (const [category, data] of Object.entries(this.currentMetadata)) {
            if (typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    csv += `"${category}","${key}","${value.replace(/"/g, '""')}"\n`;
                }
            } else {
                csv += `"${category}","","${data.replace(/"/g, '""')}"\n`;
            }
        }

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentFile.name}_metadata.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    clearAll() {
        this.currentMetadata = null;
        this.currentFile = null;
        this.fileBuffer = null;
        document.getElementById('metadataContainer').style.display = 'none';
        document.getElementById('filePreview').innerHTML = '';
        document.getElementById('fileInput').value = '';
        uploadArea.style.display = 'block';
    }

    showLoading() {
        const content = document.getElementById('metadataContent');
        content.innerHTML = `
                    <div class="loading">
                        <div class="spinner"></div>
                        <span>Extracting metadata...</span>
                    </div>
                `;
        document.getElementById('metadataContainer').style.display = 'block';
    }

    showError(message) {
        const content = document.getElementById('metadataContent');
        content.innerHTML = `
                    <div class="error-message">
                        <span class="error-icon">⚠️</span>
                        <div>
                            <strong>Error:</strong> ${message}
                        </div>
                    </div>
                `;
        document.getElementById('metadataContainer').style.display = 'block';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text.toString();
        return div.innerHTML;
    }

    capitalizeFirstLetter(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    formatKey(key) {
        return this.capitalizeFirstLetter(this.escapeHtml(key));
    }
}

// Initialize the extractor
const extractor = new UniversalMetadataExtractor();