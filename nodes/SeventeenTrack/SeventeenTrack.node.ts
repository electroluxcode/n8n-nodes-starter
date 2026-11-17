import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

const API_BASE = 'https://api.17track.net/track/v2.4';

const parseNumbers = (raw: string): string[] =>
	raw
		.split(/[\s,;]+/)
		.map((item) => item.trim())
		.filter((item) => /^[A-Za-z0-9-]{5,50}$/.test(item));

const numberOptions = [
	{ name: 'Available For Pickup', value: 'AvailableForPickup' },
	{ name: 'Delivered', value: 'Delivered' },
	{ name: 'Delivery Failure', value: 'DeliveryFailure' },
	{ name: 'Exception', value: 'Exception' },
	{ name: 'Expired', value: 'Expired' },
	{ name: 'In Transit', value: 'InTransit' },
	{ name: 'Info Received', value: 'InfoReceived' },
	{ name: 'Not Found', value: 'NotFound' },
	{ name: 'Out For Delivery', value: 'OutForDelivery' },
];

export class SeventeenTrack implements INodeType {
	description: INodeTypeDescription = {
		displayName: '17TRACK',
		name: 'seventeenTrack',
		icon: {
			light: 'file:seventeenTrack.svg',
			dark: 'file:seventeenTrack.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Cross-border e-commerce order tracking for 3500+ carriers',
		defaults: { name: '17TRACK' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'seventeenTrackApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
						description: 'Quota counters and the registered shipment list',
					},
					{
						name: 'Tracking',
						value: 'tracking',
						description: 'Register tracking numbers and manage their lifecycle',
					},
				],
				default: 'tracking',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['tracking'] } },
				options: [
					{
						name: 'Change Carrier',
						value: 'change_carrier',
						description: 'Change the carrier of registered tracking numbers',
						action: 'Change carrier',
					},
					{
						name: 'Delete',
						value: 'delete_trackings',
						description: 'Permanently delete up to 40 registered tracking numbers',
						action: 'Delete trackings',
					},
					{
						name: 'Get Tracking Details',
						value: 'get_tracking_details',
						description: 'Get current tracking details for up to 40 registered tracking numbers',
						action: 'Get tracking details',
					},
					{
						name: 'Push',
						value: 'push_trackings',
						description: 'Queue a webhook push of the latest tracking results',
						action: 'Push trackings',
					},
					{
						name: 'Register',
						value: 'register_trackings',
						description: 'Register up to 40 tracking numbers for automatic tracking by 17TRACK',
						action: 'Register trackings',
					},
					{
						name: 'Restart',
						value: 'restart_trackings',
						description: 'Restart automatic tracking for up to 40 stopped tracking numbers',
						action: 'Restart trackings',
					},
					{
						name: 'Stop',
						value: 'stop_trackings',
						description: 'Stop automatic tracking for up to 40 registered tracking numbers',
						action: 'Stop trackings',
					},
					{
						name: 'Update Tracking Info',
						value: 'update_tracking_info',
						description: 'Update the metadata of registered tracking numbers',
						action: 'Update tracking info',
					},
				],
				default: 'get_tracking_details',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['account'] } },
				options: [
					{
						name: 'Get Quota',
						value: 'get_quota',
						description: 'Get the current tracking and email quota counters',
						action: 'Get quota',
					},
					{
						name: 'List Trackings',
						value: 'list_trackings',
						description: 'List registered shipments with status and pagination filters',
						action: 'List trackings',
					},
				],
				default: 'list_trackings',
			},
			{
				displayName: 'Tracking Numbers',
				name: 'numbers',
				type: 'string',
				typeOptions: { rows: 3 },
				displayOptions: {
					show: {
						operation: [
							'register_trackings',
							'get_tracking_details',
							'stop_trackings',
							'restart_trackings',
							'delete_trackings',
							'push_trackings',
							'change_carrier',
							'update_tracking_info',
						],
					},
				},
				default: '',
				required: true,
				description: 'Tracking numbers, comma or newline separated (max 40)',
			},
			{
				displayName: 'Auto Detection',
				name: 'autoDetection',
				type: 'boolean',
				displayOptions: { show: { operation: ['register_trackings'] } },
				default: true,
				description: 'Whether 17TRACK should auto-detect the carrier',
			},
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				displayOptions: { show: { operation: ['update_tracking_info', 'register_trackings'] } },
				default: '',
				description: 'A custom tag attached to the tracking numbers',
			},
			{
				displayName: 'Remark',
				name: 'remark',
				type: 'string',
				typeOptions: { rows: 2 },
				displayOptions: { show: { operation: ['update_tracking_info', 'register_trackings'] } },
				default: '',
				description: 'A note describing the packages (max 1000 chars)',
			},
			{
				displayName: 'Old Carrier Code',
				name: 'carrierOld',
				type: 'number',
				displayOptions: { show: { operation: ['change_carrier'] } },
				default: 0,
				description: 'Current numeric 17TRACK carrier code',
			},
			{
				displayName: 'New Carrier Code',
				name: 'carrierNew',
				type: 'number',
				displayOptions: { show: { operation: ['change_carrier'] } },
				default: 0,
				required: true,
				description: 'New numeric 17TRACK carrier code',
			},
			{
				displayName: 'Page Number',
				name: 'pageNo',
				type: 'number',
				displayOptions: { show: { operation: ['list_trackings'] } },
				default: 0,
				description: 'The result page number, starting from 0',
			},
			{
				displayName: 'Package Status',
				name: 'packageStatus',
				type: 'options',
				displayOptions: { show: { operation: ['list_trackings'] } },
				options: numberOptions,
				default: 'InTransit',
				description: 'Filter by current main package status',
			},
			{
				displayName: 'Tracking Status',
				name: 'trackingStatus',
				type: 'options',
				displayOptions: { show: { operation: ['list_trackings'] } },
				options: [
					{ name: 'Tracking', value: 'Tracking' },
					{ name: 'Stopped', value: 'Stopped' },
				],
				default: 'Tracking',
				description: 'Whether 17TRACK is still tracking the shipment',
			},
			{
				displayName: 'Realtime Number',
				name: 'realtimeNumber',
				type: 'string',
				displayOptions: { show: { operation: ['get_realtime_tracking_details'] } },
				default: '',
				required: true,
				description: 'The single tracking number to query in real time',
			},
			{
				displayName: 'Cache Level',
				name: 'cacheLevel',
				type: 'options',
				displayOptions: { show: { operation: ['get_realtime_tracking_details'] } },
				options: [
					{ name: 'Standard (cacheLevel 0, 1 Quota)', value: 0 },
					{ name: 'Instant (cacheLevel 1, 10 Quota)', value: 1 },
				],
				default: 0,
				description: 'Standard returns data cached within the last 3 hours; Instant fetches immediately',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;
		const returnData: INodeExecutionData[] = [];
		let path: string;
		let body: unknown;

		if (resource === 'account' && operation === 'get_quota') {
			path = 'getquota';
			body = [];
		} else if (resource === 'account' && operation === 'list_trackings') {
			const pageNo = this.getNodeParameter('pageNo', 0) as number;
			const packageStatus = this.getNodeParameter('packageStatus', 0) as string;
			const trackingStatus = this.getNodeParameter('trackingStatus', 0) as string;
			path = 'gettracklist';
			body = {
				page_no: pageNo,
				package_status: packageStatus,
				tracking_status: trackingStatus,
			};
		} else if (operation === 'register_trackings') {
			const numbers = parseNumbers(this.getNodeParameter('numbers', 0) as string);
			if (numbers.length === 0 || numbers.length > 40) {
				throw new NodeOperationError(this.getNode(), 'Provide between 1 and 40 valid tracking numbers');
			}
			const autoDetection = this.getNodeParameter('autoDetection', 0) as boolean;
			const tag = this.getNodeParameter('tag', 0) as string;
			const remark = this.getNodeParameter('remark', 0) as string;
			path = 'register';
			body = numbers.map((number) => ({
				number,
				auto_detection: autoDetection,
				...(tag ? { tag } : {}),
				...(remark ? { remark } : {}),
			}));
		} else if (operation === 'get_tracking_details') {
			const numbers = parseNumbers(this.getNodeParameter('numbers', 0) as string);
			if (numbers.length === 0 || numbers.length > 40) {
				throw new NodeOperationError(this.getNode(), 'Provide between 1 and 40 valid tracking numbers');
			}
			path = 'gettrackinfo';
			body = numbers.map((number) => ({ number }));
		} else if (operation === 'change_carrier') {
			const numbers = parseNumbers(this.getNodeParameter('numbers', 0) as string);
			if (numbers.length === 0 || numbers.length > 40) {
				throw new NodeOperationError(this.getNode(), 'Provide between 1 and 40 valid tracking numbers');
			}
			const carrierOld = this.getNodeParameter('carrierOld', 0) as number;
			const carrierNew = this.getNodeParameter('carrierNew', 0) as number;
			path = 'changecarrier';
			body = numbers.map((number) => ({
				number,
				...(carrierOld ? { carrier_old: carrierOld } : {}),
				carrier_new: carrierNew,
			}));
		} else if (operation === 'update_tracking_info') {
			const numbers = parseNumbers(this.getNodeParameter('numbers', 0) as string);
			if (numbers.length === 0 || numbers.length > 40) {
				throw new NodeOperationError(this.getNode(), 'Provide between 1 and 40 valid tracking numbers');
			}
			const tag = this.getNodeParameter('tag', 0) as string;
			const remark = this.getNodeParameter('remark', 0) as string;
			const items = { ...(tag ? { tag } : {}), ...(remark ? { remark } : {}) };
			if (Object.keys(items).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Provide at least one field to update (tag or remark)');
			}
			path = 'changeinfo';
			body = numbers.map((number) => ({ number, items }));
		} else if (operation === 'get_realtime_tracking_details') {
			const number = this.getNodeParameter('realtimeNumber', 0) as string;
			const cacheLevel = this.getNodeParameter('cacheLevel', 0) as number;
			path = 'getRealTimeTrackInfo';
			body = [{ number, cacheLevel }];
		} else {
			const numbers = parseNumbers(this.getNodeParameter('numbers', 0) as string);
			if (numbers.length === 0 || numbers.length > 40) {
				throw new NodeOperationError(this.getNode(), 'Provide between 1 and 40 valid tracking numbers');
			}
			path =
				operation === 'stop_trackings'
					? 'stoptrack'
					: operation === 'restart_trackings'
						? 'retrack'
						: operation === 'delete_trackings'
							? 'deletetrack'
							: 'push';
			body = numbers.map((number) => ({ number }));
		}

		const response = await this.helpers.httpRequest({
			method: 'POST',
			url: `${API_BASE}/${path}`,
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(body),
		});

		const envelope = typeof response === 'string' ? JSON.parse(response) : response;
		const data = (envelope && typeof envelope === 'object' ? envelope : {}) as Record<string, unknown>;
		const innerData = (data.data ?? {}) as IDataObject;
		const errors = Array.isArray(innerData.errors)
			? (innerData.errors as unknown[])
			: [];
		const first = (errors[0] ?? {}) as Record<string, unknown>;

		if (data.code !== 0 || errors.length > 0) {
			throw new NodeOperationError(
				this.getNode(),
				`17TRACK error ${String(first.code ?? data.code)}: ${String(first.message ?? 'request failed')}`,
			);
		}

		returnData.push({ json: innerData, pairedItem: { item: 0 } });

		return [returnData];
	}
}
