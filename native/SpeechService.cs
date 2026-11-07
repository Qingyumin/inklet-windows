using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Inklet {
    public static class SpeechService {
        private const string Host = "speech.platform.bing.com";
        private const string TrustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        private const string ChromiumFullVersion = "143.0.3650.75";
        private const string ChromiumMajorVersion = "143";
        private const string SecMsGecVersion = "2-" + ChromiumFullVersion;
        private const long WinEpoch = 11644473600L;

        private static readonly HashSet<string> AllowedVoices = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "zh-CN-YunxiNeural",
            "zh-CN-YunyangNeural",
            "zh-CN-XiaoxiaoNeural",
            "zh-CN-YunjianNeural",
            "zh-CN-XiaoyiNeural",
            "zh-CN-YunxiaNeural",
            "zh-CN-liaoning-XiaobeiNeural",
            "zh-CN-shaanxi-XiaoniNeural",
            "zh-TW-HsiaoChenNeural",
            "zh-TW-YunJheNeural",
            "zh-TW-HsiaoYuNeural",
            "zh-HK-HiuMaanNeural",
            "zh-HK-HiuGaaiNeural",
            "zh-HK-WanLungNeural",
            "en-US-AvaMultilingualNeural",
            "en-US-AndrewMultilingualNeural",
            "en-US-EmmaMultilingualNeural",
            "en-US-BrianMultilingualNeural"
        };

        private static readonly HashSet<string> AllowedPitches = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "+0Hz", "-6Hz", "-3Hz", "+4Hz"
        };

        private static readonly object CacheLock = new object();
        private static readonly Dictionary<string, byte[]> AudioCache = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        private static readonly LinkedList<string> CacheOrder = new LinkedList<string>();
        private const int MaxCacheEntries = 36;

        private static readonly uint[] Sha256Initial = {
            0x6A09E667u, 0xBB67AE85u, 0x3C6EF372u, 0xA54FF53Au,
            0x510E527Fu, 0x9B05688Cu, 0x1F83D9ABu, 0x5BE0CD19u
        };
        private static readonly uint[] Sha256State = {
            0xFD9FBEA2u, 0x91243CE7u, 0xBE499094u, 0xCD2E1E0Au,
            0x6C006F49u, 0x04BD35ABu, 0xFEB0A7E4u, 0x03EFFBD2u
        };
        private static readonly uint[] Sha256Schedule = {
            0xEB24BF9Eu, 0x1558691Fu, 0xA0C09EE2u, 0x0CFA32BAu,
            0xA622EE8Cu, 0xD1DD9491u, 0xC0DD25A0u, 0xF9E70AB6u,
            0xF0C31573u, 0x7058CE4Eu, 0x7188E606u, 0x00E5AB33u,
            0xD258B060u, 0x72766564u
        };
        private static readonly uint[] Sha256RoundConstants = {
            0x428A2F98u, 0x71374491u, 0xB5C0FBCFu, 0xE9B5DBA5u, 0x3956C25Bu, 0x59F111F1u, 0x923F82A4u, 0xAB1C5ED5u,
            0xD807AA98u, 0x12835B01u, 0x243185BEu, 0x550C7DC3u, 0x72BE5D74u, 0x80DEB1FEu, 0x9BDC06A7u, 0xC19BF174u,
            0xE49B69C1u, 0xEFBE4786u, 0x0FC19DC6u, 0x240CA1CCu, 0x2DE92C6Fu, 0x4A7484AAu, 0x5CB0A9DCu, 0x76F988DAu,
            0x983E5152u, 0xA831C66Du, 0xB00327C8u, 0xBF597FC7u, 0xC6E00BF3u, 0xD5A79147u, 0x06CA6351u, 0x14292967u,
            0x27B70A85u, 0x2E1B2138u, 0x4D2C6DFCu, 0x53380D13u, 0x650A7354u, 0x766A0ABBu, 0x81C2C92Eu, 0x92722C85u,
            0xA2BFE8A1u, 0xA81A664Bu, 0xC24B8B70u, 0xC76C51A3u, 0xD192E819u, 0xD6990624u, 0xF40E3585u, 0x106AA070u,
            0x19A4C116u, 0x1E376C08u, 0x2748774Cu, 0x34B0BCB5u, 0x391C0CB3u, 0x4ED8AA4Au, 0x5B9CCA4Fu, 0x682E6FF3u,
            0x748F82EEu, 0x78A5636Fu, 0x84C87814u, 0x8CC70208u, 0x90BEFFFAu, 0xA4506CEBu, 0xBEF9A3F7u, 0xC67178F2u
        };
        private const uint Sha256Adjustment = 0xC9DC06A7u;
        private const uint Sha256Sigma0Adjustment = 0x059C0B80u;
        private const uint Sha256Sigma1Adjustment = 0x000B92C0u;

        private static readonly uint[,] Cs64Coefficients = {
            { 0xE82E91B1u, 0xB32700D0u },
            { 0x44DE24C6u, 0x88DFF51Du },
            { 0x3BEB65BCu, 0x29514038u },
            { 0xC89C5933u, 0xB328CBDFu },
            { 0x8D1EC211u, 0xD405B4D5u },
            { 0x314EF5D5u, 0x26E55F3Cu },
            { 0xE92491B1u, 0x607801C6u },
            { 0xF0A5B9D5u, 0x82B2C1FBu },
            { 0x06064CF3u, 0xFA51A3DAu },
            { 0xDA79FA60u, 0x207CC464u },
            { 0xBED20560u, 0x3C3C74F3u },
            { 0x89F9C9F8u, 0xD2D14B61u },
            { 0x35FA38C6u, 0xBB04A2C1u },
            { 0xCB49E3C6u, 0xC5626167u }
        };
        private const uint Cs64Factor = 0x82893933u;
        private const uint Cs64Adjustment0 = 0xF2F90B1Au;
        private const uint Cs64Adjustment1 = 0x0B1A0000u;

        private static uint Rol16(uint value) {
            return (value << 16) | (value >> 16);
        }
        private static uint Ror(uint value, int bits) {
            return (value >> bits) | (value << (32 - bits));
        }
        private static uint Sigma0(uint value) {
            return Ror(value, 7) ^ Ror(value, 18) ^ (value >> 3);
        }
        private static uint Sigma1(uint value) {
            return Ror(value, 17) ^ Ror(value, 19) ^ (value >> 10);
        }

        private static void ExpandSha256Schedule(uint[] words, int firstWord) {
            unchecked {
                for (int index = firstWord; index < 64; index++) {
                    words[index] = Sigma1(words[index - 2]) + words[index - 7] + Sigma0(words[index - 15]) + words[index - 16];
                }
            }
        }

        private static uint[] Sha256Rounds(uint[] initialState, uint[] words, int firstRound) {
            unchecked {
                uint a = initialState[0], b = initialState[1], c = initialState[2], d = initialState[3];
                uint e = initialState[4], f = initialState[5], g = initialState[6], h = initialState[7];
                for (int index = firstRound; index < 64; index++) {
                    uint k = (firstRound == 14 && index == 14) ? Sha256Adjustment : Sha256RoundConstants[index];
                    uint sumE = Ror(e, 6) ^ Ror(e, 11) ^ Ror(e, 25);
                    uint ch = g ^ (e & (f ^ g));
                    uint t1 = h + sumE + ch + k + words[index];
                    uint sumA = Ror(a, 2) ^ Ror(a, 13) ^ Ror(a, 22);
                    uint maj = (a & b) | (c & (a | b));
                    uint t2 = sumA + maj;
                    h = g; g = f; f = e; e = d + t1;
                    d = c; c = b; b = a; a = t1 + t2;
                }
                return new[] { a, b, c, d, e, f, g, h };
            }
        }

        private static uint[] Sha256Init(byte[] data) {
            unchecked {
                uint[] words = new uint[64];
                words[14] = ((uint)data[0] << 16) | ((uint)data[1] << 8) | data[2];
                words[15] = ((uint)data[3] << 24) | ((uint)data[4] << 16) | ((uint)data[5] << 8) | data[6];
                for (int index = 16; index < 30; index++) {
                    uint value = Sha256Schedule[index - 16];
                    if (index - 2 >= 14) value += (index == 16) ? (Sigma1(words[index - 2]) ^ Sha256Sigma1Adjustment) : Sigma1(words[index - 2]);
                    if (index - 7 >= 14) value += words[index - 7];
                    if (index - 15 >= 14) value += (index == 29) ? (Sigma0(words[index - 15]) ^ Sha256Sigma0Adjustment) : Sigma0(words[index - 15]);
                    words[index] = value;
                }
                words[30] = Sigma1(words[28]) + words[23] + Sigma0(words[15]) + words[14] + Sha256Adjustment - Sha256RoundConstants[14];
                ExpandSha256Schedule(words, 31);
                uint[] working = Sha256Rounds(Sha256State, words, 14);
                uint[] result = new uint[8];
                for (int i = 0; i < 8; i++) result[i] = Sha256Initial[i] + working[i];
                return result;
            }
        }

        private static byte[] Sha256Digest(byte[] data) {
            unchecked {
                if (data == null || data.Length < 7) throw new ArgumentException("Token salt must contain at least seven bytes");
                int length = 57 + data.Length;
                int padZeros = ((55 - length) % 64 + 64) % 64;
                int tailLength = data.Length - 7;
                byte[] padded = new byte[tailLength + 1 + padZeros + 8];
                Buffer.BlockCopy(data, 7, padded, 0, tailLength);
                padded[tailLength] = 0x80;
                ulong bitLength = (ulong)length * 8UL;
                for (int i = 0; i < 8; i++) {
                    padded[padded.Length - 1 - i] = (byte)(bitLength >> (i * 8));
                }
                uint[] state = Sha256Init(data);
                for (int offset = 0; offset < padded.Length; offset += 64) {
                    uint[] words = new uint[64];
                    for (int i = 0; i < 16; i++) {
                        int p = offset + i * 4;
                        words[i] = ((uint)padded[p] << 24) | ((uint)padded[p + 1] << 16) | ((uint)padded[p + 2] << 8) | padded[p + 3];
                    }
                    ExpandSha256Schedule(words, 16);
                    uint[] working = Sha256Rounds(state, words, 0);
                    for (int i = 0; i < 8; i++) state[i] += working[i];
                }
                byte[] digest = new byte[32];
                for (int i = 0; i < 8; i++) {
                    digest[i * 4] = (byte)(state[i] >> 24);
                    digest[i * 4 + 1] = (byte)(state[i] >> 16);
                    digest[i * 4 + 2] = (byte)(state[i] >> 8);
                    digest[i * 4 + 3] = (byte)state[i];
                }
                return digest;
            }
        }

        private static byte[] Cs64Digest(byte[] data, byte[] digest) {
            unchecked {
                uint keyA = BitConverter.ToUInt32(digest, 0) | 1u;
                uint keyB = BitConverter.ToUInt32(digest, 4) | 1u;
                uint factor0 = keyA * Cs64Factor;
                uint factor1 = keyB * Cs64Factor;
                var terms = new List<uint>(32);
                var offsets = new List<uint>(32);
                for (int i = 0; i < 14; i++) {
                    terms.Add(Cs64Coefficients[i, 0] * (i % 2 == 0 ? factor0 : factor1));
                    offsets.Add(Cs64Coefficients[i, 1]);
                }
                int rawLen = 1 + data.Length;
                int paddedLen = (rawLen + 3) & ~3;
                byte[] padded = new byte[paddedLen];
                Buffer.BlockCopy(data, 0, padded, 1, data.Length);
                int wordCount = paddedLen / 4;
                var words = new List<uint>(wordCount + 1);
                for (int i = 0; i < wordCount; i++) words.Add(BitConverter.ToUInt32(padded, i * 4));
                if (words.Count % 2 != 0) words.Add(0u);
                for (int index = 0; index < words.Count; index++) {
                    uint word = words[index];
                    uint term = word * (index % 2 == 0 ? keyA : keyB);
                    uint offset = Rol16(word) * (index % 2 == 0 ? 0xEF0569FBu : 0xC31713DBu);
                    if (index == 0) {
                        term += Cs64Adjustment0 * factor0;
                        offset += Cs64Adjustment1;
                    }
                    terms.Add(term);
                    offsets.Add(offset);
                }
                uint swapAcc = 0u, swapLast = 0u, state = 0u, acc = 0u;
                for (int index = 0; index < terms.Count; index += 2) {
                    uint x = terms[index], y = terms[index + 1];
                    uint t = Rol16(offsets[index] + x);
                    uint q = t * 0x76F50F34u;
                    swapAcc += Rol16(q) * 0xC3EFEA97u + q;
                    t = Rol16(offsets[index + 1] + y);
                    q = t * 0x1881CE3Cu;
                    swapLast = Rol16(q) * 0x35BD1EC9u + q;
                    swapAcc += swapLast;

                    state = state * keyA + x;
                    state = Rol16(state) * 0xCF98B111u;
                    state = Rol16(state) * 0x87085B9Fu;
                    state = Rol16(state) * 0x12CEB96Du;
                    state = Rol16(state) * 0x257E1D83u;
                    acc += state;
                    t = state * keyB + y;
                    t = Rol16(t) * 0xA27416F5u;
                    t = Rol16(t) * 0xD38396FFu;
                    state = Rol16(Rol16(t) * 0x7C932B89u) * 0xBFA49F69u;
                    acc += state;
                }
                uint out0 = swapLast ^ state;
                uint out1 = swapAcc ^ acc;
                byte[] result = new byte[8];
                Buffer.BlockCopy(BitConverter.GetBytes(out0), 0, result, 0, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(out1), 0, result, 4, 4);
                return result;
            }
        }

        private static string ToHexUpper(byte[] bytes) {
            var builder = new StringBuilder(bytes.Length * 2);
            for (int i = 0; i < bytes.Length; i++) builder.Append(bytes[i].ToString("X2", CultureInfo.InvariantCulture));
            return builder.ToString();
        }

        public static string GenerateSecMsGecV2(double? unixTimestamp = null) {
            double unix = unixTimestamp ?? (DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
            long seconds = (long)Math.Floor(unix) + WinEpoch;
            seconds -= seconds % 300L;
            long ticks = seconds * 10000000L;
            byte[] data = Encoding.ASCII.GetBytes(ticks.ToString(CultureInfo.InvariantCulture) + TrustedClientToken);
            byte[] sha256 = Sha256Digest(data);
            byte[] cs64 = Cs64Digest(data, sha256);
            return ToHexUpper(cs64) + "-" + ToHexUpper(sha256);
        }

        public static string NormalizeVoice(string voice) {
            if (!String.IsNullOrWhiteSpace(voice) && AllowedVoices.Contains(voice.Trim())) return voice.Trim();
            return "zh-CN-YunxiNeural";
        }

        public static string NormalizeRate(string rate) {
            if (String.IsNullOrWhiteSpace(rate)) return "+0%";
            string trimmed = rate.Trim();
            double multiplier;
            if (Double.TryParse(trimmed.TrimEnd('x', 'X'), NumberStyles.Float, CultureInfo.InvariantCulture, out multiplier)) {
                int pct = (int)Math.Round((Math.Max(0.5, Math.Min(2.0, multiplier)) - 1.0) * 100.0);
                return (pct >= 0 ? "+" : "") + pct.ToString(CultureInfo.InvariantCulture) + "%";
            }
            if ((trimmed.StartsWith("+") || trimmed.StartsWith("-")) && trimmed.EndsWith("%")) return trimmed;
            return "+0%";
        }

        public static string NormalizePitch(string pitch) {
            if (!String.IsNullOrWhiteSpace(pitch) && AllowedPitches.Contains(pitch.Trim())) return pitch.Trim();
            return "+0Hz";
        }

        public static string FormatSsml(string text, string voice, string rate, string pitch = "+0Hz") {
            var cleaned = new StringBuilder(text == null ? 0 : text.Length);
            if (!String.IsNullOrEmpty(text)) {
                for (int i = 0; i < text.Length; i++) {
                    char ch = text[i];
                    int code = ch;
                    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31)) cleaned.Append(' ');
                    else if (ch == '&') cleaned.Append("&amp;");
                    else if (ch == '<') cleaned.Append("&lt;");
                    else if (ch == '>') cleaned.Append("&gt;");
                    else if (ch == '\'') cleaned.Append("&apos;");
                    else if (ch == '"') cleaned.Append("&quot;");
                    else cleaned.Append(ch);
                }
            }
            string normalizedVoice = NormalizeVoice(voice);
            string xmlLang = normalizedVoice.StartsWith("zh-TW", StringComparison.OrdinalIgnoreCase) ? "zh-TW"
                : normalizedVoice.StartsWith("zh-HK", StringComparison.OrdinalIgnoreCase) ? "zh-HK"
                : "zh-CN";
            return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + xmlLang + "'>" +
                "<voice name='" + normalizedVoice + "'>" +
                "<prosody pitch='" + NormalizePitch(pitch) + "' rate='" + NormalizeRate(rate) + "' volume='+0%'>" +
                cleaned.ToString() +
                "</prosody></voice></speak>";
        }

        private static string EscapeJsonString(string value) {
            if (String.IsNullOrEmpty(value)) return "";
            var sb = new StringBuilder(value.Length + 8);
            foreach (char ch in value) {
                if (ch == '\\') sb.Append("\\\\");
                else if (ch == '"') sb.Append("\\\"");
                else if (ch == '\r') sb.Append("\\r");
                else if (ch == '\n') sb.Append("\\n");
                else if (ch == '\t') sb.Append("\\t");
                else if (ch < 32) sb.AppendFormat(CultureInfo.InvariantCulture, "\\u{0:X4}", (int)ch);
                else sb.Append(ch);
            }
            return sb.ToString();
        }

        private static async Task<byte[]> FetchOpenAiCompatibleSpeechAsync(string endpoint, string apiKey, string model, string voice, double speed, string text) {
            Uri uri;
            if (!Uri.TryCreate(endpoint, UriKind.Absolute, out uri) || (uri.Scheme != "http" && uri.Scheme != "https")) {
                throw new ArgumentException("外接语音接口地址必须是有效的 HTTP 或 HTTPS URL。");
            }
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(uri);
            request.Method = "POST";
            request.ContentType = "application/json; charset=utf-8";
            request.Accept = "audio/mpeg, audio/wav, audio/*";
            request.Timeout = 20000;
            request.ReadWriteTimeout = 20000;
            if (!String.IsNullOrWhiteSpace(apiKey)) {
                request.Headers["Authorization"] = "Bearer " + apiKey.Trim();
            }
            string safeModel = String.IsNullOrWhiteSpace(model) ? "tts-1" : model.Trim();
            string safeVoice = String.IsNullOrWhiteSpace(voice) ? "alloy" : voice.Trim();
            double safeSpeed = Math.Max(0.5, Math.Min(2.0, speed));
            string payload = "{\"model\":\"" + EscapeJsonString(safeModel) +
                "\",\"input\":\"" + EscapeJsonString(text) +
                "\",\"voice\":\"" + EscapeJsonString(safeVoice) +
                "\",\"speed\":" + safeSpeed.ToString("0.##", CultureInfo.InvariantCulture) +
                ",\"response_format\":\"mp3\"}";
            byte[] bodyBytes = Encoding.UTF8.GetBytes(payload);
            request.ContentLength = bodyBytes.Length;
            using (Stream reqStream = await request.GetRequestStreamAsync()) {
                await reqStream.WriteAsync(bodyBytes, 0, bodyBytes.Length);
            }
            using (WebResponse response = await request.GetResponseAsync())
            using (Stream respStream = response.GetResponseStream())
            using (var ms = new MemoryStream()) {
                if (respStream != null) await respStream.CopyToAsync(ms);
                byte[] audio = ms.ToArray();
                if (audio.Length == 0) throw new IOException("外接语音服务未返回音频数据。");
                return audio;
            }
        }

        public static async Task<object> SynthesizeAsync(string text, string voice, string rate, string pitch = "+0Hz", string provider = "edge", string endpoint = "", string model = "", string customVoice = "", string apiKey = "") {
            string trimmed = (text ?? "").Trim();
            if (trimmed.Length == 0) throw new ArgumentException("朗读内容为空。");
            if (trimmed.Length > 1800) trimmed = trimmed.Substring(0, 1800);

            if (String.Equals(provider, "openai", StringComparison.OrdinalIgnoreCase) && !String.IsNullOrWhiteSpace(endpoint)) {
                double numericRate = 1.0;
                Double.TryParse((rate ?? "1.0").Trim().TrimEnd('x', 'X'), NumberStyles.Float, CultureInfo.InvariantCulture, out numericRate);
                if (numericRate <= 0) numericRate = 1.0;
                string customKey = "openai|" + endpoint.Trim() + "|" + (model ?? "") + "|" + (customVoice ?? "") + "|" + numericRate.ToString("0.00", CultureInfo.InvariantCulture) + "|" + FileStore.TextHash(trimmed);
                byte[] customCached;
                lock (CacheLock) {
                    if (AudioCache.TryGetValue(customKey, out customCached)) {
                        return new { mime = "audio/mpeg", data = Convert.ToBase64String(customCached), voice = customVoice, engine = "openai-compatible" };
                    }
                }
                byte[] customAudio = await FetchOpenAiCompatibleSpeechAsync(endpoint.Trim(), apiKey, model, customVoice, numericRate, trimmed);
                lock (CacheLock) {
                    if (!AudioCache.ContainsKey(customKey)) {
                        while (CacheOrder.Count >= MaxCacheEntries) {
                            string oldest = CacheOrder.First.Value;
                            CacheOrder.RemoveFirst();
                            AudioCache.Remove(oldest);
                        }
                        CacheOrder.AddLast(customKey);
                        AudioCache[customKey] = customAudio;
                    }
                }
                return new { mime = "audio/mpeg", data = Convert.ToBase64String(customAudio), voice = customVoice, engine = "openai-compatible" };
            }

            string normalizedVoice = NormalizeVoice(voice);
            string normalizedRate = NormalizeRate(rate);
            string normalizedPitch = NormalizePitch(pitch);
            string cacheKey = normalizedVoice + "|" + normalizedRate + "|" + normalizedPitch + "|" + FileStore.TextHash(trimmed);
            byte[] cached;
            lock (CacheLock) {
                if (AudioCache.TryGetValue(cacheKey, out cached)) {
                    return new { mime = "audio/mpeg", data = Convert.ToBase64String(cached), voice = normalizedVoice, engine = "edge-neural" };
                }
            }
            byte[] mp3 = await FetchEdgeNeuralMp3Async(trimmed, normalizedVoice, normalizedRate, normalizedPitch);
            lock (CacheLock) {
                if (!AudioCache.ContainsKey(cacheKey)) {
                    while (CacheOrder.Count >= MaxCacheEntries) {
                        string oldest = CacheOrder.First.Value;
                        CacheOrder.RemoveFirst();
                        AudioCache.Remove(oldest);
                    }
                    CacheOrder.AddLast(cacheKey);
                    AudioCache[cacheKey] = mp3;
                }
            }
            return new { mime = "audio/mpeg", data = Convert.ToBase64String(mp3), voice = normalizedVoice, engine = "edge-neural" };
        }

        private static async Task<TcpClient> ConnectTransportAsync() {
            Uri targetUri = new Uri("https://" + Host + ":443/");
            Uri proxyUri = null;
            try {
                IWebProxy systemProxy = WebRequest.GetSystemWebProxy();
                if (systemProxy != null && !systemProxy.IsBypassed(targetUri)) {
                    Uri candidate = systemProxy.GetProxy(targetUri);
                    if (candidate != null && !String.Equals(candidate.Host, Host, StringComparison.OrdinalIgnoreCase)) proxyUri = candidate;
                }
            } catch { }
            if (proxyUri == null) {
                string envProxy = Environment.GetEnvironmentVariable("HTTPS_PROXY") ?? Environment.GetEnvironmentVariable("HTTP_PROXY");
                Uri parsedEnv;
                if (!String.IsNullOrWhiteSpace(envProxy) && Uri.TryCreate(envProxy, UriKind.Absolute, out parsedEnv)) proxyUri = parsedEnv;
            }
            if (proxyUri != null) {
                try {
                    var proxyClient = new TcpClient();
                    proxyClient.ReceiveTimeout = 15000;
                    proxyClient.SendTimeout = 15000;
                    await proxyClient.ConnectAsync(proxyUri.Host, proxyUri.Port);
                    Stream net = proxyClient.GetStream();
                    byte[] connectBytes = Encoding.ASCII.GetBytes(
                        "CONNECT " + Host + ":443 HTTP/1.1\r\n" +
                        "Host: " + Host + ":443\r\n" +
                        "Proxy-Connection: Keep-Alive\r\n\r\n");
                    await net.WriteAsync(connectBytes, 0, connectBytes.Length);
                    string statusLine = await ReadHttpHeaderBlockAsync(net);
                    if (statusLine.Contains(" 200 ")) return proxyClient;
                    proxyClient.Close();
                } catch { }
            }
            var directClient = new TcpClient();
            directClient.ReceiveTimeout = 15000;
            directClient.SendTimeout = 15000;
            await directClient.ConnectAsync(Host, 443);
            return directClient;
        }

        private static async Task<string> ReadHttpHeaderBlockAsync(Stream stream) {
            var buffer = new List<byte>(512);
            byte[] one = new byte[1];
            while (buffer.Count < 16384) {
                int read = await stream.ReadAsync(one, 0, 1);
                if (read <= 0) break;
                buffer.Add(one[0]);
                int n = buffer.Count;
                if (n >= 4 && buffer[n - 4] == '\r' && buffer[n - 3] == '\n' && buffer[n - 2] == '\r' && buffer[n - 1] == '\n') break;
            }
            return Encoding.ASCII.GetString(buffer.ToArray());
        }

        private static async Task ReadExactAsync(Stream stream, byte[] buffer, int offset, int count) {
            int total = 0;
            while (total < count) {
                int read = await stream.ReadAsync(buffer, offset + total, count - total);
                if (read <= 0) throw new EndOfStreamException("语音流连接提前中断。");
                total += read;
            }
        }

        private static async Task SendWebSocketFrameAsync(Stream stream, int opcode, byte[] payload) {
            byte[] mask = new byte[4];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(mask);
            using (var frame = new MemoryStream(payload.Length + 14)) {
                frame.WriteByte((byte)(0x80 | (opcode & 0x0F)));
                if (payload.Length <= 125) {
                    frame.WriteByte((byte)(0x80 | payload.Length));
                } else if (payload.Length <= 65535) {
                    frame.WriteByte(0x80 | 126);
                    frame.WriteByte((byte)((payload.Length >> 8) & 0xFF));
                    frame.WriteByte((byte)(payload.Length & 0xFF));
                } else {
                    frame.WriteByte(0x80 | 127);
                    ulong len = (ulong)payload.Length;
                    for (int i = 7; i >= 0; i--) frame.WriteByte((byte)((len >> (i * 8)) & 0xFF));
                }
                frame.Write(mask, 0, 4);
                byte[] masked = new byte[payload.Length];
                for (int i = 0; i < payload.Length; i++) masked[i] = (byte)(payload[i] ^ mask[i & 3]);
                frame.Write(masked, 0, masked.Length);
                byte[] bytes = frame.ToArray();
                await stream.WriteAsync(bytes, 0, bytes.Length);
            }
        }

        private static async Task<byte[]> FetchEdgeNeuralMp3Async(string text, string voice, string rate, string pitch = "+0Hz") {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            string connectionId = Guid.NewGuid().ToString("N");
            string secMsGec = GenerateSecMsGecV2();
            string pathAndQuery = "/consumer/speech/synthesize/readaloud/edge/v1" +
                "?TrustedClientToken=" + TrustedClientToken +
                "&ConnectionId=" + connectionId +
                "&Sec-MS-GEC=" + secMsGec +
                "&Sec-MS-GEC-Version=" + SecMsGecVersion;

            byte[] wsKeyBytes = new byte[16];
            byte[] muidBytes = new byte[16];
            using (var rng = RandomNumberGenerator.Create()) {
                rng.GetBytes(wsKeyBytes);
                rng.GetBytes(muidBytes);
            }
            string wsKey = Convert.ToBase64String(wsKeyBytes);
            string muid = ToHexUpper(muidBytes);

            using (TcpClient tcp = await ConnectTransportAsync())
            using (var ssl = new SslStream(tcp.GetStream(), false)) {
                await ssl.AuthenticateAsClientAsync(Host, null, SslProtocols.Tls12, false);
                string handshake =
                    "GET " + pathAndQuery + " HTTP/1.1\r\n" +
                    "Host: " + Host + "\r\n" +
                    "Connection: Upgrade\r\n" +
                    "Upgrade: websocket\r\n" +
                    "Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold\r\n" +
                    "Sec-WebSocket-Version: 13\r\n" +
                    "Sec-WebSocket-Key: " + wsKey + "\r\n" +
                    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + ChromiumMajorVersion + ".0.0.0 Safari/537.36 Edg/" + ChromiumMajorVersion + ".0.0.0\r\n" +
                    "Cookie: muid=" + muid + ";\r\n" +
                    "Pragma: no-cache\r\n" +
                    "Cache-Control: no-cache\r\n\r\n";
                byte[] handshakeBytes = Encoding.ASCII.GetBytes(handshake);
                await ssl.WriteAsync(handshakeBytes, 0, handshakeBytes.Length);
                string responseHeader = await ReadHttpHeaderBlockAsync(ssl);
                if (!responseHeader.StartsWith("HTTP/1.1 101", StringComparison.OrdinalIgnoreCase)) {
                    throw new IOException("语音合成服务握手未通过。");
                }

                string timestamp = DateTime.UtcNow.ToString("ddd MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'", CultureInfo.InvariantCulture);
                string configMsg =
                    "X-Timestamp:" + timestamp + "\r\n" +
                    "Content-Type:application/json; charset=utf-8\r\n" +
                    "Path:speech.config\r\n\r\n" +
                    "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"true\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n";
                await SendWebSocketFrameAsync(ssl, 0x1, Encoding.UTF8.GetBytes(configMsg));

                string ssmlMsg =
                    "X-RequestId:" + Guid.NewGuid().ToString("N") + "\r\n" +
                    "Content-Type:application/ssml+xml\r\n" +
                    "X-Timestamp:" + timestamp + "Z\r\n" +
                    "Path:ssml\r\n\r\n" +
                    FormatSsml(text, voice, rate, pitch);
                await SendWebSocketFrameAsync(ssl, 0x1, Encoding.UTF8.GetBytes(ssmlMsg));

                using (var mp3Out = new MemoryStream())
                using (var fragmented = new MemoryStream()) {
                    int fragmentOpcode = 0;
                    byte[] head = new byte[2];
                    while (true) {
                        await ReadExactAsync(ssl, head, 0, 2);
                        bool fin = (head[0] & 0x80) != 0;
                        int opcode = head[0] & 0x0F;
                        bool masked = (head[1] & 0x80) != 0;
                        long payloadLen = head[1] & 0x7F;
                        if (payloadLen == 126) {
                            byte[] ext = new byte[2];
                            await ReadExactAsync(ssl, ext, 0, 2);
                            payloadLen = ((ext[0] << 8) | ext[1]);
                        } else if (payloadLen == 127) {
                            byte[] ext = new byte[8];
                            await ReadExactAsync(ssl, ext, 0, 8);
                            payloadLen = 0;
                            for (int i = 0; i < 8; i++) payloadLen = (payloadLen << 8) | ext[i];
                        }
                        if (payloadLen < 0 || payloadLen > 16 * 1024 * 1024) throw new IOException("语音数据包长度异常。");
                        byte[] maskKey = null;
                        if (masked) {
                            maskKey = new byte[4];
                            await ReadExactAsync(ssl, maskKey, 0, 4);
                        }
                        byte[] payload = new byte[(int)payloadLen];
                        if (payloadLen > 0) await ReadExactAsync(ssl, payload, 0, (int)payloadLen);
                        if (masked) {
                            for (int i = 0; i < payload.Length; i++) payload[i] ^= maskKey[i & 3];
                        }

                        if (opcode == 0x8) break;
                        if (opcode == 0x9) {
                            await SendWebSocketFrameAsync(ssl, 0xA, payload);
                            continue;
                        }
                        if (opcode == 0xA) continue;

                        if (opcode != 0) {
                            fragmentOpcode = opcode;
                            fragmented.SetLength(0);
                        }
                        fragmented.Write(payload, 0, payload.Length);
                        if (!fin) continue;

                        byte[] message = fragmented.ToArray();
                        if (fragmentOpcode == 0x2) {
                            if (message.Length >= 2) {
                                int headerLen = (message[0] << 8) | message[1];
                                if (headerLen + 2 <= message.Length) {
                                    string headerText = Encoding.ASCII.GetString(message, 2, headerLen);
                                    if (headerText.IndexOf("Path:audio", StringComparison.OrdinalIgnoreCase) >= 0) {
                                        int audioOffset = 2 + headerLen;
                                        int audioCount = message.Length - audioOffset;
                                        if (audioCount > 0) mp3Out.Write(message, audioOffset, audioCount);
                                    }
                                }
                            }
                        } else if (fragmentOpcode == 0x1) {
                            string textMsg = Encoding.UTF8.GetString(message);
                            if (textMsg.IndexOf("Path:turn.end", StringComparison.OrdinalIgnoreCase) >= 0) break;
                        }
                    }
                    byte[] result = mp3Out.ToArray();
                    if (result.Length == 0) throw new IOException("未收到有效的语音音频流。");
                    return result;
                }
            }
        }
    }
}
