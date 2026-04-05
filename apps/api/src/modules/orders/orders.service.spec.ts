import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFirebase(docData: any = {}, docExists = true) {
  const auditAdd = jest.fn().mockResolvedValue({ id: 'audit-id' });

  const docRef = {
    get: jest.fn().mockResolvedValue({
      exists: docExists,
      id: docData?.id || 'order-id',
      data: () => ({ id: 'order-id', status: 'PENDING', ...docData }),
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const fb = {
    db: {
      collection: jest.fn().mockImplementation((name: string) => ({
        doc: jest.fn().mockReturnValue(docRef),
        add: name === 'audit_logs' ? auditAdd : jest.fn().mockResolvedValue({ id: 'x' }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'order-id', data: () => ({ id: 'order-id', ...docData }) }],
        }),
      })),
    },
    _docRef: docRef,
    _auditAdd: auditAdd,
  } as any;

  return fb;
}

const mockCustomers = { upsertFromOrder: jest.fn().mockResolvedValue(undefined) } as any;
const mockSheets = { appendOrderRow: jest.fn().mockResolvedValue(undefined) } as any;

const baseDto = {
  customerName: 'João Silva',
  customerPhone: '11999999999',
  customerEmail: 'joao@teste.com',
  address: 'Rua das Flores, 123',
  city: 'Osasco',
  shippingCost: 5.0,
  items: [
    {
      productId: 'p1',
      productName: 'Elfbar',
      variantId: 'v1',
      variantName: 'Mango Ice',
      quantity: 2,
      unitPrice: 89.9,
    },
  ],
};

describe('OrdersService', () => {
  // ── createWithId ────────────────────────────────────────────────────────────

  describe('createWithId', () => {
    it('deve criar pedido com orderNumber no formato CP-XXXXXXXX', async () => {
      const firebase = makeFirebase();
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      const result = await service.createWithId('uuid-123', baseDto);

      expect(result.orderNumber).toMatch(/^CP-\d{8}$/);
      expect(result.id).toBe('uuid-123');
    });

    it('deve calcular total corretamente (subtotal + frete)', async () => {
      const firebase = makeFirebase();
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      const result = await service.createWithId('uuid-123', baseDto);

      const expectedSubtotal = 89.9 * 2;
      expect(result.subtotal).toBeCloseTo(expectedSubtotal);
      expect(result.total).toBeCloseTo(expectedSubtotal + 5.0);
    });

    it('deve salvar snapshot dos produtos com nome e preço no momento do pedido', async () => {
      const firebase = makeFirebase();
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      const result = await service.createWithId('uuid-123', baseDto);

      expect(result.items[0].productName).toBe('Elfbar');
      expect(result.items[0].unitPrice).toBe(89.9);
      expect(result.items[0].variantName).toBe('Mango Ice');
    });

    it('deve salvar o pedido com status PENDING', async () => {
      const firebase = makeFirebase();
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      const result = await service.createWithId('uuid-123', baseDto);

      expect(result.status).toBe('PENDING');
    });
  });

  // ── updateStatus ────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('deve lançar BadRequestException para status inválido', async () => {
      const firebase = makeFirebase();
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      await expect(service.updateStatus('order-id', 'INVALIDO')).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException para pedido inexistente', async () => {
      const firebase = makeFirebase({}, false);
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      await expect(service.updateStatus('nao-existe', 'PAID')).rejects.toThrow(NotFoundException);
    });

    it('deve registrar audit_log em cada mudança de status', async () => {
      const firebase = makeFirebase({ id: 'order-id', status: 'PENDING' });
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      await service.updateStatus('order-id', 'PAID', 'admin');

      expect(firebase._auditAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'status_changed',
          entityType: 'order',
          actorId: 'admin',
          payload: expect.objectContaining({ to: 'PAID' }),
        }),
      );
    });

    it('deve aceitar todos os status válidos sem lançar erro', async () => {
      const validStatuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

      for (const status of validStatuses) {
        const firebase = makeFirebase({ id: 'order-id', status: 'PENDING' });
        const service = new OrdersService(firebase, mockCustomers, mockSheets);
        await expect(service.updateStatus('order-id', status)).resolves.not.toThrow();
      }
    });
  });

  // ── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('deve lançar NotFoundException para id inexistente', async () => {
      const firebase = makeFirebase({}, false);
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      await expect(service.findById('nao-existe')).rejects.toThrow(NotFoundException);
    });

    it('deve retornar o pedido quando encontrado', async () => {
      const firebase = makeFirebase({ id: 'order-id', status: 'PENDING' });
      const service = new OrdersService(firebase, mockCustomers, mockSheets);

      const result = await service.findById('order-id');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status', 'PENDING');
    });
  });
});
