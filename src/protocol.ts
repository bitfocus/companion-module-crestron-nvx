import http from 'node:http'
import https from 'node:https'
import { URL } from 'node:url'
import type { DefaultRouteMode, ModuleConfig, ModuleSecrets } from './config.js'

export type SignalKind = 'video' | 'audio' | 'usb'

export interface RequestOptions {
	host: string
	protocol: 'http' | 'https'
	port: number
	authenticated: boolean
	username: string
	password: string
	timeoutMs: number
	allowSelfSigned: boolean
}

export interface NvxSource {
	id: string
	label: string
	sessionName: string
	host: string
	multicastAddress: string
	rtspUri: string
	status: string
	syncDetected: boolean | undefined
	bitrate: number | undefined
}

export interface NvxInput {
	id: string
	value: string
	label: string
	portType: string
	syncDetected: boolean | undefined
}

export interface NvxRoute {
	name: string
	uniqueId: string
	videoSource: string
	audioSource: string
	usbSource: string
	automaticStreamRoutingEnabled: boolean | undefined
}

export interface NvxEndpoint {
	host: string
	protocol: 'http' | 'https'
	port: number
	authenticated: boolean
	label: string
	model: string
	serial: string
	firmware: string
	deviceMode: string
	usbMode: string
	videoSource: string
	activeVideoSource: string
	transmitBitrate: number | undefined
	isEncoder: boolean
	isDecoder: boolean
	inputs: NvxInput[]
	routes: NvxRoute[]
	sources: NvxSource[]
	usbFollowsVideo: boolean | undefined
	secondaryAudioFollowsVideo: boolean | undefined
	lastStatus: string
}

export interface DiscoveryResult {
	endpoints: NvxEndpoint[]
	errors: string[]
}

export interface CresNextResult {
	statusCode: number
	body: unknown
	rawBody: string
}

interface Cookie {
	name: string
	value: string
}

type Dictionary = Record<string, unknown>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Dictionary {
	return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value
	if (value === 'true') return true
	if (value === 'false') return false
	return undefined
}

function numberValue(value: unknown, fallback: number): number {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

function encodeCookie(cookies: Cookie[]): string {
	return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

function mergeCookies(existing: Cookie[], headers: http.IncomingHttpHeaders): Cookie[] {
	const next = new Map(existing.map((cookie) => [cookie.name, cookie.value]))
	for (const raw of headers['set-cookie'] ?? []) {
		const [pair] = raw.split(';', 1)
		const eq = pair.indexOf('=')
		if (eq > 0) next.set(pair.slice(0, eq), pair.slice(eq + 1))
	}
	return [...next.entries()].map(([name, value]) => ({ name, value }))
}

async function request(
	options: RequestOptions,
	method: 'GET' | 'POST',
	path: string,
	body?: string,
	cookies: Cookie[] = [],
	contentType = 'application/json',
): Promise<{ result: CresNextResult; cookies: Cookie[] }> {
	const url = new URL(`${options.protocol}://${options.host}:${options.port}${path}`)
	const headers: Record<string, string | number> = {
		Referer: `${options.protocol}://${options.host}/`,
		Origin: `${options.protocol}://${options.host}`,
	}

	if (cookies.length > 0) headers.Cookie = encodeCookie(cookies)
	if (body !== undefined) {
		headers['Content-Type'] = contentType
		headers['Content-Length'] = Buffer.byteLength(body)
	}

	const agent =
		options.protocol === 'https' ? new https.Agent({ rejectUnauthorized: !options.allowSelfSigned }) : new http.Agent()

	return new Promise((resolve, reject) => {
		const transport = options.protocol === 'https' ? https : http
		const req = transport.request(
			url,
			{
				method,
				headers,
				agent,
				timeout: options.timeoutMs,
			},
			(res) => {
				const chunks: Buffer[] = []
				res.on('data', (chunk: Buffer) => chunks.push(chunk))
				res.on('end', () => {
					const rawBody = Buffer.concat(chunks).toString('utf8')
					let parsed: unknown = rawBody
					if (rawBody.trim()) {
						try {
							parsed = JSON.parse(rawBody)
						} catch {
							parsed = rawBody
						}
					}

					resolve({
						result: {
							statusCode: res.statusCode ?? 0,
							body: parsed,
							rawBody,
						},
						cookies: mergeCookies(cookies, res.headers),
					})
				})
			},
		)

		req.on('timeout', () => {
			req.destroy(new Error(`Request timed out after ${options.timeoutMs} ms`))
		})
		req.on('error', reject)
		if (body !== undefined) req.write(body)
		req.end()
	})
}

async function authenticate(options: RequestOptions): Promise<Cookie[]> {
	let cookies: Cookie[] = []
	const loginPage = await request(options, 'GET', '/userlogin.html', undefined, cookies)
	cookies = loginPage.cookies

	const form = `login=${encodeURIComponent(options.username)}&&passwd=${encodeURIComponent(options.password)}`
	const login = await request(options, 'POST', '/userlogin.html', form, cookies, 'application/x-www-form-urlencoded')
	cookies = login.cookies

	if (![200, 302].includes(login.result.statusCode)) {
		throw new Error(`Login failed with HTTP ${login.result.statusCode}`)
	}

	return cookies
}

async function withSession<T>(options: RequestOptions, task: (cookies: Cookie[]) => Promise<T>): Promise<T> {
	const cookies = options.authenticated ? await authenticate(options) : []
	return task(cookies)
}

export async function cresNextGet(options: RequestOptions, path: string): Promise<CresNextResult> {
	return withSession(options, async (cookies) => {
		const { result } = await request(options, 'GET', normalizePath(path), undefined, cookies)
		if (result.statusCode < 200 || result.statusCode >= 300)
			throw new Error(`GET ${path} failed with HTTP ${result.statusCode}`)
		return result
	})
}

export async function cresNextPost(options: RequestOptions, path: string, payload: unknown): Promise<CresNextResult> {
	return withSession(options, async (cookies) => {
		const { result } = await request(options, 'POST', normalizePath(path), JSON.stringify(payload), cookies)
		if (result.statusCode < 200 || result.statusCode >= 300) {
			throw new Error(`POST ${path} failed with HTTP ${result.statusCode}`)
		}
		validateActions(result.body)
		return result
	})
}

function validateActions(body: unknown): void {
	if (!isRecord(body) || !Array.isArray(body.Actions)) return
	const failures: string[] = []
	for (const action of body.Actions) {
		if (!isRecord(action) || !Array.isArray(action.Results)) continue
		for (const result of action.Results) {
			if (!isRecord(result)) continue
			const statusId = Number(result.StatusId)
			if (Number.isFinite(statusId) && statusId < 0) {
				failures.push(
					`${stringValue(result.Path) || stringValue(result.Property) || 'Property'}: ${stringValue(result.StatusInfo) || statusId}`,
				)
			}
		}
	}
	if (failures.length > 0) throw new Error(failures.join('; '))
}

function normalizePath(path: string): string {
	const trimmed = path.trim()
	if (!trimmed) return '/Device'
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function makeOptions(
	host: string,
	protocol: 'http' | 'https',
	authenticated: boolean,
	config: ModuleConfig,
	secrets: ModuleSecrets,
	timeoutOverride?: number,
): RequestOptions {
	return {
		host,
		protocol,
		port: protocol === 'https' ? numberValue(config.httpsPort, 443) : numberValue(config.httpPort, 80),
		authenticated,
		username: config.username || 'admin',
		password: secrets.password ?? '',
		timeoutMs: timeoutOverride ?? numberValue(config.requestTimeoutMs, 5000),
		allowSelfSigned: config.allowSelfSigned !== false,
	}
}

function getCandidateOptions(
	host: string,
	config: ModuleConfig,
	secrets: ModuleSecrets,
	timeoutOverride?: number,
): RequestOptions[] {
	const mode = config.authMode
	if (mode === 'https-login') return [makeOptions(host, 'https', true, config, secrets, timeoutOverride)]
	if (mode === 'http-no-auth') return [makeOptions(host, 'http', false, config, secrets, timeoutOverride)]
	if (!secrets.password) {
		return [
			makeOptions(host, 'http', false, config, secrets, timeoutOverride),
			makeOptions(host, 'https', false, config, secrets, timeoutOverride),
			makeOptions(host, 'https', true, config, secrets, timeoutOverride),
		]
	}
	return [
		makeOptions(host, 'https', true, config, secrets, timeoutOverride),
		makeOptions(host, 'http', false, config, secrets, timeoutOverride),
		makeOptions(host, 'https', false, config, secrets, timeoutOverride),
	]
}

export async function fetchEndpoint(
	host: string,
	config: ModuleConfig,
	secrets: ModuleSecrets,
	timeoutOverride?: number,
): Promise<NvxEndpoint> {
	const errors: string[] = []
	for (const options of getCandidateOptions(host, config, secrets, timeoutOverride)) {
		try {
			return await readEndpoint(options, config)
		} catch (error) {
			errors.push(
				`${options.protocol}${options.authenticated ? '+auth' : ''}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
	throw new Error(errors.join(' | '))
}

async function readEndpoint(options: RequestOptions, config: ModuleConfig): Promise<NvxEndpoint> {
	let cookies = options.authenticated ? await authenticate(options) : []
	const deviceInfoResult = await safeGetWithCookies(options, cookies, '/Device/DeviceInfo')
	cookies = deviceInfoResult.cookies
	const usbResult = await safeGetWithCookies(options, cookies, '/Device/Usb')
	cookies = usbResult.cookies
	const avioResult = await safeGetWithCookies(options, cookies, '/Device/AudioVideoInputOutput')
	cookies = avioResult.cookies
	const avRoutingResult = await safeGetWithCookies(options, cookies, '/Device/AvRouting')
	cookies = avRoutingResult.cookies
	const deviceSpecificResult = await safeGetWithCookies(options, cookies, '/Device/DeviceSpecific')
	cookies = deviceSpecificResult.cookies
	const discoveredStreamsResult = await safeGetWithCookies(options, cookies, '/Device/DiscoveredStreams')
	cookies = discoveredStreamsResult.cookies
	const xioSubscriptionResult = await safeGetWithCookies(options, cookies, '/Device/XioSubscription')
	cookies = xioSubscriptionResult.cookies
	const streamTransmitResult = await safeGetWithCookies(options, cookies, '/Device/StreamTransmit')

	const deviceInfo = deviceInfoResult.body
	const usb = usbResult.body
	const avio = avioResult.body
	const avRouting = avRoutingResult.body
	const deviceSpecific = deviceSpecificResult.body
	const discoveredStreams = discoveredStreamsResult.body
	const xioSubscription = xioSubscriptionResult.body
	const streamTransmit = streamTransmitResult.body

	if (
		deviceInfo === undefined &&
		usb === undefined &&
		avio === undefined &&
		avRouting === undefined &&
		deviceSpecific === undefined &&
		discoveredStreams === undefined &&
		xioSubscription === undefined &&
		streamTransmit === undefined
	) {
		throw new Error('No DM NVX API objects returned')
	}

	const routes = parseRoutes(avRouting)
	const discovered = parseDiscoveredStreams(discoveredStreams, options.host, config.sourceAliases)
	const subscribed = parseXioSubscriptions(xioSubscription, options.host, config.sourceAliases)
	const transmitted = parseStreamTransmit(streamTransmit, options.host, config.sourceAliases)
	const sources = mergeSources([...discovered, ...subscribed, ...transmitted])
	const inputs = parseInputs(avio)
	const info = findDeviceInfo(deviceInfo)
	const usbPort = findPrimaryUsbPort(usb)
	const specific = findDeviceSpecific(deviceSpecific)
	const routeControl = findRouteControl(avRouting)
	const label = readEndpointLabel(info, options.host)
	const deviceMode = stringValue(specific.DeviceMode)
	const modeIsTransmitter = /^(transmitter|encoder)$/i.test(deviceMode)
	const modeIsReceiver = /^(receiver|decoder)$/i.test(deviceMode)
	const fallbackEncoder = sources.some((source) => source.host === options.host) || /E\d|encoder/i.test(label)
	const fallbackDecoder = routes.length > 0 || /D\d|decoder/i.test(label)

	return {
		host: options.host,
		protocol: options.protocol,
		port: options.port,
		authenticated: options.authenticated,
		label,
		model: stringValue(info.Model) || stringValue(info.ModelName) || stringValue(info.ProductName),
		serial: stringValue(info.SerialNumber) || stringValue(info.Serial),
		firmware: stringValue(info.FirmwareVersion) || stringValue(info.Version),
		deviceMode,
		usbMode: stringValue(usbPort.Mode),
		videoSource: stringValue(specific.VideoSource),
		activeVideoSource: stringValue(specific.ActiveVideoSource),
		transmitBitrate: sources.find((source) => source.host === options.host)?.bitrate,
		isEncoder: deviceMode ? modeIsTransmitter : fallbackEncoder,
		isDecoder: deviceMode ? modeIsReceiver : fallbackDecoder,
		inputs,
		routes,
		sources,
		usbFollowsVideo: booleanValue(routeControl.IsUsbFollowsVideoEnabled),
		secondaryAudioFollowsVideo: booleanValue(routeControl.IsSecondaryAudioFollowsVideoEnabled),
		lastStatus: 'OK',
	}
}

function findPrimaryUsbPort(value: unknown): Dictionary {
	const device = isRecord(value) ? value.Device : undefined
	const usb = isRecord(device) ? device.Usb : undefined
	const ports = isRecord(usb) ? usb.UsbPorts : undefined
	if (!Array.isArray(ports)) return {}
	return ports.find(isRecord) ?? {}
}

function parseInputs(value: unknown): NvxInput[] {
	const device = isRecord(value) ? value.Device : undefined
	const avio = isRecord(device) ? device.AudioVideoInputOutput : undefined
	const inputs = isRecord(avio) ? avio.Inputs : undefined
	if (!Array.isArray(inputs)) return []

	return inputs.filter(isRecord).map((input, index) => {
		const port = Array.isArray(input.Ports) ? input.Ports.find(isRecord) : undefined
		const hdmi = isRecord(port?.Hdmi) ? port.Hdmi : undefined
		const value = `Input${index + 1}`
		return {
			id: stringValue(input.Name) || `input${index}`,
			value,
			label: stringValue(hdmi?.Name) || value,
			portType: stringValue(port?.PortType),
			syncDetected: booleanValue(port?.IsSyncDetected),
		}
	})
}

async function safeGetWithCookies(
	options: RequestOptions,
	cookies: Cookie[],
	path: string,
): Promise<{ body: unknown; cookies: Cookie[] }> {
	try {
		const response = await request(options, 'GET', path, undefined, cookies)
		if (response.result.statusCode < 200 || response.result.statusCode >= 300) {
			return { body: undefined, cookies: response.cookies }
		}
		return { body: response.result.body, cookies: response.cookies }
	} catch {
		return { body: undefined, cookies }
	}
}

function findDeviceInfo(value: unknown): Dictionary {
	const device = isRecord(value) ? value.Device : undefined
	const info = isRecord(device) ? device.DeviceInfo : undefined
	return isRecord(info) ? info : {}
}

function findRouteControl(value: unknown): Dictionary {
	const device = isRecord(value) ? value.Device : undefined
	const routing = isRecord(device) ? device.AvRouting : undefined
	const control = isRecord(routing) ? routing.RouteControl : undefined
	return isRecord(control) ? control : {}
}

function findDeviceSpecific(value: unknown): Dictionary {
	const device = isRecord(value) ? value.Device : undefined
	const specific = isRecord(device) ? device.DeviceSpecific : undefined
	return isRecord(specific) ? specific : {}
}

function readEndpointLabel(info: Dictionary, host: string): string {
	return (
		stringValue(info.HostName) ||
		stringValue(info.Name) ||
		stringValue(info.DeviceName) ||
		stringValue(info.ProductName) ||
		stringValue(info.Model) ||
		host
	)
}

function parseRoutes(value: unknown): NvxRoute[] {
	const device = isRecord(value) ? value.Device : undefined
	const routing = isRecord(device) ? device.AvRouting : undefined
	const routes = isRecord(routing) ? routing.Routes : undefined
	if (!Array.isArray(routes)) return []
	return routes.filter(isRecord).map((route, index) => ({
		name: stringValue(route.Name) || `Routing${index}`,
		uniqueId: stringValue(route.UniqueId),
		videoSource: stringValue(route.VideoSource),
		audioSource: stringValue(route.AudioSource),
		usbSource: stringValue(route.UsbSource),
		automaticStreamRoutingEnabled: booleanValue(route.AutomaticStreamRoutingEnabled),
	}))
}

function parseAliasMap(raw: string): Map<string, string> {
	const map = new Map<string, string>()
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || !trimmed.includes('=')) continue
		const [key, label] = trimmed.split('=', 2)
		if (key.trim() && label.trim()) map.set(key.trim().toLowerCase(), label.trim())
	}
	return map
}

function sourceLabel(source: Partial<NvxSource>, aliases: Map<string, string>): string {
	for (const key of [source.id, source.sessionName, source.host]) {
		if (!key) continue
		const alias = aliases.get(key.toLowerCase())
		if (alias) return alias
	}
	return source.sessionName || source.host || source.id || 'NVX Source'
}

function parseDiscoveredStreams(value: unknown, host: string, rawAliases: string): NvxSource[] {
	const aliases = parseAliasMap(rawAliases)
	const device = isRecord(value) ? value.Device : undefined
	const discovered = isRecord(device) ? device.DiscoveredStreams : undefined
	const streams = isRecord(discovered) ? discovered.Streams : undefined
	if (!isRecord(streams)) return []

	const sources: NvxSource[] = []
	for (const [key, value] of Object.entries(streams)) {
		if (!isRecord(value)) continue
		const id = stringValue(value.UniqueId) || key
		const partial: Partial<NvxSource> = {
			id,
			sessionName: stringValue(value.SessionName) || key,
			host: parseHostFromUri(stringValue(value.RtspUri)) || host,
		}
		sources.push({
			id,
			label: sourceLabel(partial, aliases),
			sessionName: partial.sessionName ?? '',
			host: partial.host ?? host,
			multicastAddress: stringValue(value.MulticastAddress),
			rtspUri: stringValue(value.RtspUri),
			status: '',
			syncDetected: undefined,
			bitrate: numberOrUndefined(value.Bitrate),
		})
	}
	return sources
}

function parseXioSubscriptions(value: unknown, host: string, rawAliases: string): NvxSource[] {
	const aliases = parseAliasMap(rawAliases)
	const device = isRecord(value) ? value.Device : undefined
	const xio = isRecord(device) ? device.XioSubscription : undefined
	const subscriptions = isRecord(xio) ? xio.Subscriptions : undefined
	if (!isRecord(subscriptions)) return []

	const sources: NvxSource[] = []
	for (const [key, value] of Object.entries(subscriptions)) {
		if (!isRecord(value)) continue
		const id = stringValue(value.UniqueId) || (UUID_RE.test(key) ? key : '')
		if (!id) continue
		const partial: Partial<NvxSource> = {
			id,
			sessionName: stringValue(value.SessionName) || key,
			host: parseHostFromUri(stringValue(value.RtspUri)) || host,
		}
		sources.push({
			id,
			label: sourceLabel(partial, aliases),
			sessionName: partial.sessionName ?? '',
			host: partial.host ?? host,
			multicastAddress: stringValue(value.MulticastAddress),
			rtspUri: stringValue(value.RtspUri),
			status: stringValue(value.Status),
			syncDetected: booleanValue(value.IsSyncDetected),
			bitrate: numberOrUndefined(value.Bitrate),
		})
	}
	return sources
}

function parseStreamTransmit(value: unknown, host: string, rawAliases: string): NvxSource[] {
	const aliases = parseAliasMap(rawAliases)
	const device = isRecord(value) ? value.Device : undefined
	const transmit = isRecord(device) ? device.StreamTransmit : undefined
	const streams = isRecord(transmit) ? transmit.Streams : undefined
	if (!Array.isArray(streams)) return []

	const sources: NvxSource[] = []
	for (const value of streams) {
		if (!isRecord(value)) continue
		const id = stringValue(value.UUID) || stringValue(value.UniqueId)
		if (!id) continue
		const partial: Partial<NvxSource> = {
			id,
			sessionName: stringValue(value.RtspSessionName) || stringValue(value.SessionName) || id,
			host,
		}
		sources.push({
			id,
			label: sourceLabel(partial, aliases),
			sessionName: partial.sessionName ?? '',
			host,
			multicastAddress: stringValue(value.MulticastAddress),
			rtspUri: stringValue(value.StreamLocation),
			status: stringValue(value.Status),
			syncDetected: booleanValue(value.CodecReady),
			bitrate: numberOrUndefined(value.Bitrate),
		})
	}
	return sources
}

function numberOrUndefined(value: unknown): number | undefined {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : undefined
}

function mergeSources(sources: NvxSource[]): NvxSource[] {
	const merged = new Map<string, NvxSource>()
	for (const source of sources) {
		const key = source.id || source.sessionName || source.rtspUri
		if (!key) continue
		const existing = merged.get(key)
		merged.set(key, existing ? { ...existing, ...source, label: existing.label || source.label } : source)
	}
	return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label))
}

function parseHostFromUri(uri: string): string {
	if (!uri) return ''
	try {
		return new URL(uri).hostname
	} catch {
		return ''
	}
}

function ipToNumber(ip: string): number | undefined {
	const parts = ip.split('.').map((part) => Number(part))
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined
	return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]
}

function numberToIp(value: number): string {
	return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

export function expandCidr(cidr: string, maxHosts = 1024): string[] {
	const [ip, prefixRaw] = cidr.trim().split('/', 2)
	const base = ipToNumber(ip)
	const prefix = Number(prefixRaw)
	if (base === undefined || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) return []
	const hostBits = 32 - prefix
	const count = Math.min(2 ** hostBits, maxHosts)
	const mask = prefix === 32 ? 0xffffffff : (0xffffffff << hostBits) >>> 0
	const network = base & mask
	const start = prefix >= 31 ? network : network + 1
	const end = prefix >= 31 ? network + count - 1 : network + count - 2
	const hosts: string[] = []
	for (let value = start; value <= end && hosts.length < maxHosts; value++) hosts.push(numberToIp(value >>> 0))
	return hosts
}

function parseKnownHosts(raw: string): string[] {
	const hosts = new Set<string>()
	for (const entry of raw.split(/[\s,;]+/)) {
		const trimmed = entry.trim()
		if (trimmed) hosts.add(trimmed)
	}
	return [...hosts]
}

export async function discoverEndpoints(config: ModuleConfig, secrets: ModuleSecrets): Promise<DiscoveryResult> {
	const knownHosts = parseKnownHosts(config.knownEndpoints || '')
	const hosts =
		config.mode === 'endpoint'
			? [(config.endpointHost || '').trim()].filter(Boolean)
			: knownHosts.length > 0
				? knownHosts
				: expandCidr(config.discoverySubnet || '', 1024)
	const concurrency = Math.max(1, Math.min(64, numberValue(config.scanConcurrency, 16)))
	const timeoutMs = numberValue(config.scanTimeoutMs, 1200)
	const endpoints: NvxEndpoint[] = []
	const errors: string[] = []
	let index = 0

	async function worker(): Promise<void> {
		for (;;) {
			const host = hosts[index++]
			if (!host) return
			try {
				endpoints.push(await fetchEndpoint(host, config, secrets, timeoutMs))
			} catch (error) {
				errors.push(`${host}: ${error instanceof Error ? error.message : String(error)}`)
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, async () => worker()))
	endpoints.sort((a, b) => a.host.localeCompare(b.host, undefined, { numeric: true }))
	return { endpoints, errors }
}

export function buildRoutePayload(sourceId: string, routeMode: DefaultRouteMode | SignalKind | 'av'): unknown {
	const route: Dictionary = {}
	if (routeMode === 'av-usb' || routeMode === 'av' || routeMode === 'video') route.VideoSource = sourceId
	if (routeMode === 'av-usb' || routeMode === 'av' || routeMode === 'audio') route.AudioSource = sourceId
	if (routeMode === 'av-usb' || routeMode === 'usb') route.UsbSource = sourceId

	return {
		Device: {
			AvRouting: {
				Routes: [route],
			},
		},
	}
}

export function buildRouteControlPayload(options: {
	usbFollowsVideo?: boolean
	secondaryAudioFollowsVideo?: boolean
}): unknown {
	const routeControl: Dictionary = {}
	if (options.usbFollowsVideo !== undefined) routeControl.IsUsbFollowsVideoEnabled = options.usbFollowsVideo
	if (options.secondaryAudioFollowsVideo !== undefined) {
		routeControl.IsSecondaryAudioFollowsVideoEnabled = options.secondaryAudioFollowsVideo
	}
	return {
		Device: {
			AvRouting: {
				RouteControl: routeControl,
			},
		},
	}
}

export function buildDeviceModePayload(mode: 'Transmitter' | 'Receiver'): unknown {
	return {
		Device: {
			DeviceSpecific: {
				DeviceMode: mode,
			},
		},
	}
}

export function buildHostnamePayload(name: string): unknown {
	return {
		Device: {
			DeviceInfo: {
				Name: name,
			},
		},
	}
}

export function buildTransmitBitratePayload(bitrate: number): unknown {
	return {
		Device: {
			StreamTransmit: {
				Streams: [
					{
						Bitrate: bitrate,
					},
				],
			},
		},
	}
}

export function buildInputPayload(input: string): unknown {
	return {
		Device: {
			DeviceSpecific: {
				VideoSource: input,
			},
		},
	}
}

export function buildUsbModePayload(mode: 'Local' | 'Remote'): unknown {
	return {
		Device: {
			Usb: {
				UsbPorts: [
					{
						Mode: mode,
					},
				],
			},
		},
	}
}

export function getRequestOptionsForEndpoint(
	endpoint: NvxEndpoint,
	config: ModuleConfig,
	secrets: ModuleSecrets,
): RequestOptions {
	return {
		...makeOptions(endpoint.host, endpoint.protocol, endpoint.authenticated, config, secrets),
		port: endpoint.port,
	}
}
