import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Input,
  Select,
  Table,
  Tag,
  Modal,
  Form,
  Space,
  Typography,
  Switch,
  Badge,
  Tooltip,
  Popconfirm,
  Tabs,
  ColorPicker,
  Empty,
  Spin,
  Alert,
  Statistic,
  Progress,
  App as AntApp
} from 'antd';
import {
  Palette,
  Ruler,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Sparkles,
  RefreshCw,
  Copy,
  Edit3,
  Trash2,
  ListFilter,
  LayoutGrid,
  TableProperties,
  ArrowUpDown,
  BarChart3,
  Package,
  Wand2,
  SlidersHorizontal,
  Info
} from 'lucide-react';
import api from '../../api';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// Standard preset palettes for apparel & retail
const PRESET_COLOR_PALETTES = [
  { name: 'أسود فاحم', code: '#000000' },
  { name: 'أبيض ناصع', code: '#FFFFFF' },
  { name: 'أوف وايت / سكري', code: '#F8F6F0' },
  { name: 'كحلي داكن', code: '#0F172A' },
  { name: 'أزرق كلاسيك', code: '#1D4ED8' },
  { name: 'أزرق سماوي', code: '#38BDF8' },
  { name: 'رمادي ميلانج', code: '#64748B' },
  { name: 'رمادي فاتح', code: '#E2E8F0' },
  { name: 'بيج كلاسيك', code: '#D4B996' },
  { name: 'جملي / هافان', code: '#C19A6B' },
  { name: 'بني شوكولاتة', code: '#5C381E' },
  { name: 'نبيتي / بوردو', code: '#7F1D1D' },
  { name: 'أحمر قرمزي', code: '#DC2626' },
  { name: 'زيتي / عسكري', code: '#3F4F38' },
  { name: 'أخضر زمردي', code: '#15803D' },
  { name: 'أصفر خردلي', code: '#EAB308' },
  { name: 'وردي بودري (بينك)', code: '#F472B6' },
  { name: 'موف / لافندر', code: '#A855F7' }
];

// Standard preset sizes runs
const PRESET_SIZE_RUNS = {
  apparel_letters: {
    title: 'ملابس قياسية (XS إلى 4XL)',
    sizes: [
      { name: 'XS', code: 'XS' },
      { name: 'S', code: 'S' },
      { name: 'M', code: 'M' },
      { name: 'L', code: 'L' },
      { name: 'XL', code: 'XL' },
      { name: '2XL', code: '2XL' },
      { name: '3XL', code: '3XL' },
      { name: '4XL', code: '4XL' }
    ]
  },
  footwear: {
    title: 'أحذية ومقاسات رجالي/حريمي (36 إلى 45)',
    sizes: [
      { name: '36', code: '36' },
      { name: '37', code: '37' },
      { name: '38', code: '38' },
      { name: '39', code: '39' },
      { name: '40', code: '40' },
      { name: '41', code: '41' },
      { name: '42', code: '42' },
      { name: '43', code: '43' },
      { name: '44', code: '44' },
      { name: '45', code: '45' }
    ]
  },
  universal: {
    title: 'مقاسات موحدة وحرة',
    sizes: [
      { name: 'Free Size', code: 'FREE' },
      { name: 'One Size', code: 'OS' },
      { name: 'حجم موحد', code: 'STD' }
    ]
  }
};

export default function ColorsAndSizes({ currentUser }) {
  const { message, modal } = AntApp.useApp();

  const [activeMainTab, setActiveMainTab] = useState('colors'); // 'colors' | 'sizes' | 'matrix'
  const [loading, setLoading] = useState(false);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Search & Filter state
  const [colorSearch, setColorSearch] = useState('');
  const [colorStatusFilter, setColorStatusFilter] = useState('all');
  const [colorsViewMode, setColorsViewMode] = useState('grid'); // 'grid' | 'table'

  const [sizeSearch, setSizeSearch] = useState('');
  const [sizeStatusFilter, setSizeStatusFilter] = useState('all');
  const [sizeTypeFilter, setSizeTypeFilter] = useState('all'); // 'all' | 'letters' | 'numbers' | 'free'

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalAttrType, setModalAttrType] = useState('color'); // 'color' | 'size'
  const [editingAttr, setEditingAttr] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [attrForm] = Form.useForm();

  // Batch Wizard Modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchType, setBatchType] = useState('size'); // 'color' | 'size'
  const [batchPresetKey, setBatchPresetKey] = useState('apparel_letters');
  const [batchCustomInput, setBatchCustomInput] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // Matrix variant search state
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixFilterType, setMatrixFilterType] = useState('all');
  const [matrixVariants, setMatrixVariants] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  // Load all colors & sizes & stats
  const fetchAllAttributes = useCallback(async () => {
    setLoading(true);
    try {
      const [colorsRes, sizesRes, analyticsRes] = await Promise.all([
        api.get('/api/swm/attributes', { params: { type: 'color' } }),
        api.get('/api/swm/attributes', { params: { type: 'size' } }),
        api.get('/api/swm/attributes/analytics').catch(() => ({ data: { success: false } }))
      ]);

      if (colorsRes.data?.success) {
        setColors(colorsRes.data.data || []);
      }
      if (sizesRes.data?.success) {
        setSizes(sizesRes.data.data || []);
      }
      if (analyticsRes.data?.success) {
        setAnalytics(analyticsRes.data.data || null);
      }
    } catch (err) {
      console.error('Failed to load warehouse attributes:', err);
      message.error('فشل في تحميل بيانات الألوان والمقاسات');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchAllAttributes();
  }, [fetchAllAttributes]);

  // Load matrix samples on tab change
  const fetchMatrixData = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      // Query recent products with variants to inspect attribute linkage
      const res = await api.get('/api/swm/products', { params: { limit: 50, page: 1 } });
      if (res.data?.success) {
        const prods = res.data.data?.products || [];
        const flattenedVariants = [];
        prods.forEach((p) => {
          if (Array.isArray(p.variants)) {
            p.variants.forEach((v) => {
              flattenedVariants.push({
                ...v,
                product_name: p.name,
                product_code: p.product_code,
                category_name: p.category_name,
                selling_price: v.price_modifier ? Number(p.selling_price) + Number(v.price_modifier) : p.selling_price
              });
            });
          }
        });
        setMatrixVariants(flattenedVariants);
      }
    } catch (err) {
      console.error('Failed to load matrix variants:', err);
    } finally {
      setLoadingMatrix(false);
    }
  }, []);

  useEffect(() => {
    if (activeMainTab === 'matrix') {
      fetchMatrixData();
    }
  }, [activeMainTab, fetchMatrixData]);

  // Open Create Modal
  const handleOpenCreate = (type) => {
    setModalAttrType(type);
    setEditingAttr(null);
    attrForm.resetFields();
    attrForm.setFieldsValue({
      attribute_type: type,
      status: 'active',
      code: type === 'color' ? '#000000' : '',
      display_order: (type === 'color' ? colors.length : sizes.length) + 1
    });
    setIsEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (attr) => {
    setModalAttrType(attr.attribute_type);
    setEditingAttr(attr);
    attrForm.resetFields();
    attrForm.setFieldsValue({
      name: attr.name,
      code: attr.code || (attr.attribute_type === 'color' ? '#000000' : ''),
      display_order: attr.display_order || 0,
      status: attr.status || 'active',
      sync_variants: false
    });
    setIsEditModalOpen(true);
  };

  // Save (Create or Update)
  const handleSaveAttribute = async () => {
    try {
      const values = await attrForm.validateFields();
      setFormSubmitting(true);

      if (editingAttr) {
        const res = await api.put(`/api/swm/attributes/${editingAttr.id}`, {
          ...values,
          code: values.code ? values.code.trim() : null
        });
        if (res.data?.success) {
          message.success('تم تحديث الخاصية بنجاح');
          setIsEditModalOpen(false);
          fetchAllAttributes();
        }
      } else {
        const res = await api.post('/api/swm/attributes', {
          attribute_type: modalAttrType,
          name: values.name.trim(),
          code: values.code ? values.code.trim() : null,
          display_order: values.display_order || 0
        });
        if (res.data?.success) {
          message.success(`تمت إضافة ${modalAttrType === 'color' ? 'اللون' : 'المقاس'} بنجاح`);
          setIsEditModalOpen(false);
          fetchAllAttributes();
        }
      }
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ الخاصية');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle active/inactive status quickly
  const handleToggleStatus = async (attr, checked) => {
    try {
      const newStatus = checked ? 'active' : 'inactive';
      const res = await api.put(`/api/swm/attributes/${attr.id}`, {
        status: newStatus
      });
      if (res.data?.success) {
        message.success(`تم ${checked ? 'تفعيل' : 'تعطيل'} ${attr.name} بنجاح`);
        if (attr.attribute_type === 'color') {
          setColors((prev) => prev.map((c) => (c.id === attr.id ? { ...c, status: newStatus } : c)));
        } else {
          setSizes((prev) => prev.map((s) => (s.id === attr.id ? { ...s, status: newStatus } : s)));
        }
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'فشل تحديث حالة الخاصية');
    }
  };

  // Safe Delete Attribute
  const handleDeleteAttribute = async (attr) => {
    try {
      const res = await api.delete(`/api/swm/attributes/${attr.id}`);
      if (res.data?.success) {
        message.success('تم الحذف بنجاح');
        fetchAllAttributes();
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.has_usage) {
        modal.confirm({
          title: 'تنبيه ارتباط بالمخزون',
          icon: <AlertTriangle color="#f59e0b" size={24} style={{ marginLeft: 8 }} />,
          content: (
            <div>
              <Paragraph style={{ marginBottom: 8 }}>
                {errData.message}
              </Paragraph>
              <Text type="secondary" style={{ fontSize: 13 }}>
                يُفضل تعطيل هذا العنصر لإخفائه من القوائم الجديدة دون التأثير على الأصناف الحالية. هل ترغب في تعطيله الآن؟
              </Text>
            </div>
          ),
          okText: 'نعم، قم بتعطيله',
          cancelText: 'إلغاء',
          onOk: () => handleToggleStatus(attr, false)
        });
      } else {
        message.error(errData?.message || 'فشل حذف الخاصية');
      }
    }
  };

  // Quick Duplicate / Clone Color or Size
  const handleCloneAttribute = (attr) => {
    setModalAttrType(attr.attribute_type);
    setEditingAttr(null);
    attrForm.resetFields();
    attrForm.setFieldsValue({
      name: `${attr.name} (نسخة)`,
      code: attr.code || '',
      display_order: (attr.display_order || 0) + 1,
      status: 'active'
    });
    setIsEditModalOpen(true);
  };

  // Copy code helper
  const handleCopyCode = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    message.success(`تم نسخ "${text}" للحافظة`);
  };

  // Handle Batch Add
  const handleExecuteBatchAdd = async () => {
    try {
      setBatchSubmitting(true);
      let itemsToInsert = [];

      if (batchType === 'size') {
        if (batchPresetKey === 'custom') {
          const lines = batchCustomInput
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (lines.length === 0) {
            message.warning('يرجى إدخال مقاس واحد على الأقل');
            return;
          }
          itemsToInsert = lines.map((name, i) => ({
            name,
            code: name.toUpperCase(),
            display_order: sizes.length + i + 1
          }));
        } else {
          const preset = PRESET_SIZE_RUNS[batchPresetKey];
          if (!preset) return;
          itemsToInsert = preset.sizes.map((s, i) => ({
            name: s.name,
            code: s.code,
            display_order: sizes.length + i + 1
          }));
        }
      } else {
        // Color presets
        itemsToInsert = PRESET_COLOR_PALETTES.map((c, i) => ({
          name: c.name,
          code: c.code,
          display_order: colors.length + i + 1
        }));
      }

      const res = await api.post('/api/swm/attributes/batch', {
        attribute_type: batchType,
        items: itemsToInsert
      });

      if (res.data?.success) {
        message.success(res.data.message || 'تمت الإضافة بنجاح');
        setIsBatchModalOpen(false);
        setBatchCustomInput('');
        fetchAllAttributes();
      }
    } catch (err) {
      message.error(err.response?.data?.message || 'فشل تنفيذ الإضافة المجمعة');
    } finally {
      setBatchSubmitting(false);
    }
  };

  // Filtered Colors
  const filteredColors = useMemo(() => {
    return colors.filter((c) => {
      const matchSearch =
        !colorSearch ||
        c.name.toLowerCase().includes(colorSearch.toLowerCase()) ||
        (c.code && c.code.toLowerCase().includes(colorSearch.toLowerCase()));

      const matchStatus =
        colorStatusFilter === 'all' ||
        (colorStatusFilter === 'active' && c.status === 'active') ||
        (colorStatusFilter === 'inactive' && c.status === 'inactive');

      return matchSearch && matchStatus;
    });
  }, [colors, colorSearch, colorStatusFilter]);

  // Filtered Sizes
  const filteredSizes = useMemo(() => {
    return sizes.filter((s) => {
      const matchSearch =
        !sizeSearch ||
        s.name.toLowerCase().includes(sizeSearch.toLowerCase()) ||
        (s.code && s.code.toLowerCase().includes(sizeSearch.toLowerCase()));

      const matchStatus =
        sizeStatusFilter === 'all' ||
        (sizeStatusFilter === 'active' && s.status === 'active') ||
        (sizeStatusFilter === 'inactive' && s.status === 'inactive');

      let matchType = true;
      if (sizeTypeFilter === 'letters') {
        matchType = /^[A-Za-z]+$/.test(s.name.trim());
      } else if (sizeTypeFilter === 'numbers') {
        matchType = /^\d+(\.\d+)?$/.test(s.name.trim());
      } else if (sizeTypeFilter === 'free') {
        matchType = /free|one|موحد/i.test(s.name);
      }

      return matchSearch && matchStatus && matchType;
    });
  }, [sizes, sizeSearch, sizeStatusFilter, sizeTypeFilter]);

  // Filtered Matrix Variants
  const filteredMatrixVariants = useMemo(() => {
    return matrixVariants.filter((v) => {
      const q = matrixSearch.toLowerCase();
      const matchText =
        !q ||
        (v.product_name && v.product_name.toLowerCase().includes(q)) ||
        (v.variant_sku && v.variant_sku.toLowerCase().includes(q)) ||
        (v.color && v.color.toLowerCase().includes(q)) ||
        (v.size && v.size.toLowerCase().includes(q));

      let matchType = true;
      if (matrixFilterType === 'has_color') matchType = Boolean(v.color);
      if (matrixFilterType === 'has_size') matchType = Boolean(v.size);

      return matchText && matchType;
    });
  }, [matrixVariants, matrixSearch, matrixFilterType]);

  // Total metrics
  const activeColorsCount = useMemo(() => colors.filter((c) => c.status === 'active').length, [colors]);
  const activeSizesCount = useMemo(() => sizes.filter((s) => s.status === 'active').length, [sizes]);
  const totalVariantsCount = useMemo(() => {
    const sumC = colors.reduce((acc, c) => acc + (Number(c.usage_count) || 0), 0);
    return sumC;
  }, [colors]);

  return (
    <div style={{ direction: 'rtl', paddingBottom: 40 }}>
      {/* 1. TOP EXECUTIVE HEADER BANNER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #090D16 0%, #172033 60%, #0F172A 100%)',
          borderRadius: 16,
          padding: '24px 28px',
          color: '#F8FAFC',
          marginBottom: 20,
          border: '1px solid rgba(200, 164, 92, 0.35)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 20px rgba(200, 164, 92, 0.08)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: -50,
            width: 180,
            height: 180,
            background: 'radial-gradient(circle, rgba(200, 164, 92, 0.22) 0%, transparent 70%)',
            pointerEvents: 'none'
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Row align="middle" justify="space-between" gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Space align="center" size={12} style={{ marginBottom: 6 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(200, 164, 92, 0.15)',
                    border: '1.5px solid rgba(200, 164, 92, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DFCA95'
                  }}
                >
                  <Palette size={24} />
                </div>
                <div>
                  <Title level={3} style={{ color: '#DFCA95', margin: 0, fontWeight: 800 }}>
                    إدارة الألوان والمقاسات للمخازن
                  </Title>
                  <Text style={{ color: '#94A3B8', fontSize: 13 }}>
                    نظام إدارة السمات القياسية لمنتجات وقطع المستودعات المركزية والفروع
                  </Text>
                </div>
              </Space>
            </Col>

            <Col xs={24} lg={10} style={{ textAlign: 'left' }}>
              <Space wrap size={10}>
                <Button
                  icon={<RefreshCw size={15} style={{ marginLeft: 4 }} />}
                  onClick={fetchAllAttributes}
                  loading={loading}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    borderRadius: 8,
                    fontWeight: 600
                  }}
                >
                  تحديث البيانات
                </Button>

                <Button
                  icon={<Wand2 size={15} style={{ marginLeft: 4 }} />}
                  onClick={() => {
                    setBatchType(activeMainTab === 'sizes' ? 'size' : 'color');
                    setIsBatchModalOpen(true);
                  }}
                  style={{
                    backgroundColor: '#1E293B',
                    borderColor: '#475569',
                    color: '#38BDF8',
                    borderRadius: 8,
                    fontWeight: 700
                  }}
                >
                  إضافة سريعة مجمعة
                </Button>

                <Button
                  type="primary"
                  icon={<Plus size={16} style={{ marginLeft: 4 }} />}
                  onClick={() => handleOpenCreate(activeMainTab === 'sizes' ? 'size' : 'color')}
                  style={{
                    backgroundColor: '#7e22ce',
                    borderColor: '#7e22ce',
                    borderRadius: 8,
                    fontWeight: 700
                  }}
                >
                  {activeMainTab === 'sizes' ? 'إضافة مقاس جديد' : 'إضافة لون جديد'}
                </Button>
              </Space>
            </Col>
          </Row>

          {/* Quick Metrics Bar */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge color="#10B981" />
              <span style={{ color: '#94A3B8', fontSize: 13 }}>الألوان النشطة:</span>
              <strong style={{ color: '#FFFFFF', fontSize: 15 }}>
                {activeColorsCount} <span style={{ fontSize: 11, color: '#64748B' }}>/ {colors.length}</span>
              </strong>
            </div>

            <div style={{ width: 1, height: 18, backgroundColor: 'rgba(255, 255, 255, 0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge color="#38BDF8" />
              <span style={{ color: '#94A3B8', fontSize: 13 }}>المقاسات النشطة:</span>
              <strong style={{ color: '#FFFFFF', fontSize: 15 }}>
                {activeSizesCount} <span style={{ fontSize: 11, color: '#64748B' }}>/ {sizes.length}</span>
              </strong>
            </div>

            <div style={{ width: 1, height: 18, backgroundColor: 'rgba(255, 255, 255, 0.15)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Badge color="#F59E0B" />
              <span style={{ color: '#94A3B8', fontSize: 13 }}>القطع والـ Variants المرتبطة:</span>
              <strong style={{ color: '#DFCA95', fontSize: 15 }}>{totalVariantsCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN TABS NAVIGATION */}
      <Tabs
        activeKey={activeMainTab}
        onChange={setActiveMainTab}
        type="card"
        size="large"
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'colors',
            label: (
              <Space>
                <Palette size={16} color="#7c3aed" />
                <span style={{ fontWeight: 700 }}>باليت الألوان ({colors.length})</span>
              </Space>
            ),
            children: (
              <div>
                {/* Colors Filter & Actions Bar */}
                <Card
                  style={{
                    marginBottom: 16,
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)'
                  }}
                  styles={{ body: { padding: '14px 18px' } }}
                >
                  <Row gutter={[12, 12]} align="middle" justify="space-between">
                    <Col xs={24} md={10} lg={8}>
                      <Input
                        prefix={<Search size={16} color="#94A3B8" />}
                        placeholder="البحث باسم اللون أو كود Hex..."
                        value={colorSearch}
                        onChange={(e) => setColorSearch(e.target.value)}
                        allowClear
                        size="middle"
                      />
                    </Col>

                    <Col xs={24} md={14} lg={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <Select
                        value={colorStatusFilter}
                        onChange={setColorStatusFilter}
                        style={{ width: 140 }}
                        size="middle"
                      >
                        <Option value="all">جميع الحالات</Option>
                        <Option value="active">نشط فقط ({activeColorsCount})</Option>
                        <Option value="inactive">معطل فقط ({colors.length - activeColorsCount})</Option>
                      </Select>

                      <Space.Compact>
                        <Button
                          type={colorsViewMode === 'grid' ? 'primary' : 'default'}
                          icon={<LayoutGrid size={15} />}
                          onClick={() => setColorsViewMode('grid')}
                          title="عرض شبكة بطاقات"
                        />
                        <Button
                          type={colorsViewMode === 'table' ? 'primary' : 'default'}
                          icon={<TableProperties size={15} />}
                          onClick={() => setColorsViewMode('table')}
                          title="عرض جدول تفصيلي"
                        />
                      </Space.Compact>

                      <Button
                        type="primary"
                        icon={<Plus size={15} style={{ marginLeft: 4 }} />}
                        onClick={() => handleOpenCreate('color')}
                        style={{ backgroundColor: '#7e22ce', borderColor: '#7e22ce', fontWeight: 600 }}
                      >
                        لون جديد
                      </Button>
                    </Col>
                  </Row>
                </Card>

                {/* Colors Content: Grid Mode vs Table Mode */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 12, color: '#64748B' }}>جاري تحميل ألوان المخازن...</div>
                  </div>
                ) : filteredColors.length === 0 ? (
                  <Empty
                    description={colorSearch ? 'لا توجد ألوان مطابقة لبحثك' : 'لم يتم تسجيل أي ألوان حتى الآن'}
                    style={{ padding: 40 }}
                  >
                    <Button type="primary" onClick={() => handleOpenCreate('color')} style={{ backgroundColor: '#7e22ce' }}>
                      إضافة أول لون
                    </Button>
                  </Empty>
                ) : colorsViewMode === 'grid' ? (
                  <Row gutter={[16, 16]}>
                    {filteredColors.map((color) => {
                      const hex = color.code || '#1E293B';
                      const isDarkHex = (hexCode) => {
                        if (!hexCode || !hexCode.startsWith('#')) return false;
                        const c = hexCode.replace('#', '');
                        const r = parseInt(c.substr(0, 2), 16);
                        const g = parseInt(c.substr(2, 2), 16);
                        const b = parseInt(c.substr(4, 2), 16);
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        return brightness < 128;
                      };
                      const dark = isDarkHex(hex);

                      return (
                        <Col xs={24} sm={12} md={8} lg={6} xl={4.8} key={color.id}>
                          <Card
                            hoverable
                            style={{
                              borderRadius: 12,
                              border: '1px solid #E2E8F0',
                              overflow: 'hidden',
                              transition: 'all 0.2s ease',
                              opacity: color.status === 'inactive' ? 0.65 : 1
                            }}
                            styles={{ body: { padding: '14px' } }}
                          >
                            {/* Color Header Swatch */}
                            <div
                              style={{
                                height: 75,
                                borderRadius: 8,
                                backgroundColor: hex,
                                border: '1.5px solid rgba(0, 0, 0, 0.08)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                padding: '8px 10px',
                                position: 'relative',
                                marginBottom: 12,
                                boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
                              }}
                            >
                              <Tooltip title="نسخ الكود اللوني">
                                <Tag
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyCode(hex);
                                  }}
                                  style={{
                                    backgroundColor: dark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
                                    color: dark ? '#FFFFFF' : '#0F172A',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 11,
                                    cursor: 'pointer',
                                    margin: 0,
                                    direction: 'ltr'
                                  }}
                                >
                                  {hex}
                                </Tag>
                              </Tooltip>

                              <Tag
                                color={color.status === 'active' ? 'success' : 'default'}
                                style={{ margin: 0, fontSize: 10, fontWeight: 700 }}
                              >
                                {color.status === 'active' ? 'نشط' : 'معطل'}
                              </Tag>
                            </div>

                            {/* Info */}
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text strong style={{ fontSize: 15, color: '#0F172A' }}>
                                  {color.name}
                                </Text>
                                <span style={{ fontSize: 11, color: '#94A3B8' }}>
                                  #{color.display_order || 0}
                                </span>
                              </div>

                              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Package size={13} color="#64748B" />
                                <span style={{ fontSize: 12, color: '#64748B' }}>
                                  المستخدم في المخزون:{' '}
                                  <strong style={{ color: Number(color.usage_count) > 0 ? '#16A34A' : '#94A3B8' }}>
                                    {color.usage_count || 0} صنف
                                  </strong>
                                </span>
                              </div>
                            </div>

                            {/* Card Actions */}
                            <div
                              style={{
                                borderTop: '1px solid #F1F5F9',
                                paddingTop: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <Tooltip title={color.status === 'active' ? 'تعطيل اللون' : 'تفعيل اللون'}>
                                <Switch
                                  size="small"
                                  checked={color.status === 'active'}
                                  onChange={(chk) => handleToggleStatus(color, chk)}
                                />
                              </Tooltip>

                              <Space size={4}>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<Edit3 size={14} color="#0284c7" />}
                                  onClick={() => handleOpenEdit(color)}
                                  title="تعديل"
                                />
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<Copy size={14} color="#64748b" />}
                                  onClick={() => handleCloneAttribute(color)}
                                  title="تكرار"
                                />
                                <Popconfirm
                                  title="حذف اللون"
                                  description="هل أنت متأكد من حذف هذا اللون من النظام؟"
                                  onConfirm={() => handleDeleteAttribute(color)}
                                  okText="نعم، حذف"
                                  cancelText="إلغاء"
                                  okButtonProps={{ danger: true }}
                                >
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<Trash2 size={14} />}
                                    title="حذف"
                                  />
                                </Popconfirm>
                              </Space>
                            </div>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                ) : (
                  /* Table Mode for Colors */
                  <Card style={{ borderRadius: 12, border: '1px solid #E2E8F0' }} styles={{ body: { padding: 0 } }}>
                    <Table
                      dataSource={filteredColors}
                      rowKey="id"
                      pagination={{ pageSize: 20, showSizeChanger: true }}
                      size="middle"
                      columns={[
                        {
                          title: 'معاينة اللون',
                          dataIndex: 'code',
                          key: 'swatch',
                          width: 100,
                          render: (code) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  backgroundColor: code || '#000',
                                  border: '1.5px solid rgba(0, 0, 0, 0.15)',
                                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                }}
                              />
                            </div>
                          )
                        },
                        {
                          title: 'اسم اللون',
                          dataIndex: 'name',
                          key: 'name',
                          render: (name) => <strong style={{ color: '#0F172A' }}>{name}</strong>
                        },
                        {
                          title: 'الكود اللوني (Hex Code)',
                          dataIndex: 'code',
                          key: 'code',
                          render: (code) => (
                            <Tag
                              onClick={() => handleCopyCode(code)}
                              style={{ cursor: 'pointer', fontFamily: 'monospace', direction: 'ltr' }}
                            >
                              {code || 'غير محدد'}
                            </Tag>
                          )
                        },
                        {
                          title: 'الارتباط بالمنتجات والـ Variants',
                          dataIndex: 'usage_count',
                          key: 'usage_count',
                          sorter: (a, b) => (Number(a.usage_count) || 0) - (Number(b.usage_count) || 0),
                          render: (count) => (
                            <Tag color={Number(count) > 0 ? 'green' : 'default'} style={{ fontWeight: 700 }}>
                              {count || 0} صنف مرتبط
                            </Tag>
                          )
                        },
                        {
                          title: 'الترتيب',
                          dataIndex: 'display_order',
                          key: 'display_order',
                          width: 90,
                          sorter: (a, b) => (a.display_order || 0) - (b.display_order || 0)
                        },
                        {
                          title: 'الحالة',
                          dataIndex: 'status',
                          key: 'status',
                          width: 120,
                          render: (status, record) => (
                            <Switch
                              checkedChildren="نشط"
                              unCheckedChildren="معطل"
                              checked={status === 'active'}
                              onChange={(chk) => handleToggleStatus(record, chk)}
                            />
                          )
                        },
                        {
                          title: 'الإجراءات',
                          key: 'actions',
                          width: 140,
                          render: (_, record) => (
                            <Space size={6}>
                              <Button
                                size="small"
                                icon={<Edit3 size={13} />}
                                onClick={() => handleOpenEdit(record)}
                              >
                                تعديل
                              </Button>
                              <Popconfirm
                                title="حذف اللون"
                                description="هل أنت متأكد من حذف هذا اللون؟"
                                onConfirm={() => handleDeleteAttribute(record)}
                                okText="نعم"
                                cancelText="إلغاء"
                                okButtonProps={{ danger: true }}
                              >
                                <Button size="small" danger icon={<Trash2 size={13} />} />
                              </Popconfirm>
                            </Space>
                          )
                        }
                      ]}
                    />
                  </Card>
                )}
              </div>
            )
          },
          {
            key: 'sizes',
            label: (
              <Space>
                <Ruler size={16} color="#0284c7" />
                <span style={{ fontWeight: 700 }}>منظومة المقاسات ({sizes.length})</span>
              </Space>
            ),
            children: (
              <div>
                {/* Sizes Filter & Actions Bar */}
                <Card
                  style={{
                    marginBottom: 16,
                    borderRadius: 12,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)'
                  }}
                  styles={{ body: { padding: '14px 18px' } }}
                >
                  <Row gutter={[12, 12]} align="middle" justify="space-between">
                    <Col xs={24} md={8}>
                      <Input
                        prefix={<Search size={16} color="#94A3B8" />}
                        placeholder="البحث باسم المقاس أو الكود المختصر..."
                        value={sizeSearch}
                        onChange={(e) => setSizeSearch(e.target.value)}
                        allowClear
                        size="middle"
                      />
                    </Col>

                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <Select
                        value={sizeTypeFilter}
                        onChange={setSizeTypeFilter}
                        style={{ width: 160 }}
                        size="middle"
                      >
                        <Option value="all">جميع الأنواع</Option>
                        <Option value="letters">حروف (S, M, L...)</Option>
                        <Option value="numbers">أرقام (38, 40, 42...)</Option>
                        <Option value="free">مقاس حر / موحد</Option>
                      </Select>

                      <Select
                        value={sizeStatusFilter}
                        onChange={setSizeStatusFilter}
                        style={{ width: 140 }}
                        size="middle"
                      >
                        <Option value="all">جميع الحالات</Option>
                        <Option value="active">نشط فقط ({activeSizesCount})</Option>
                        <Option value="inactive">معطل فقط ({sizes.length - activeSizesCount})</Option>
                      </Select>

                      <Button
                        type="primary"
                        icon={<Plus size={15} style={{ marginLeft: 4 }} />}
                        onClick={() => handleOpenCreate('size')}
                        style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', fontWeight: 600 }}
                      >
                        مقاس جديد
                      </Button>
                    </Col>
                  </Row>
                </Card>

                {/* Sizes Table View */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 12, color: '#64748B' }}>جاري تحميل مقاسات المخازن...</div>
                  </div>
                ) : (
                  <Card style={{ borderRadius: 12, border: '1px solid #E2E8F0' }} styles={{ body: { padding: 0 } }}>
                    <Table
                      dataSource={filteredSizes}
                      rowKey="id"
                      pagination={{ pageSize: 25, showSizeChanger: true }}
                      size="middle"
                      columns={[
                        {
                          title: 'رمز المقاس',
                          dataIndex: 'name',
                          key: 'name',
                          render: (name) => (
                            <Tag
                              color="blue"
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                padding: '4px 10px',
                                borderRadius: 6
                              }}
                            >
                              {name}
                            </Tag>
                          )
                        },
                        {
                          title: 'الكود المختصر (Normalized Code)',
                          dataIndex: 'code',
                          key: 'code',
                          render: (code, record) => (
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>
                              {code || record.name}
                            </span>
                          )
                        },
                        {
                          title: 'نوع المقاس',
                          key: 'size_type',
                          render: (_, record) => {
                            const isNum = /^\d+(\.\d+)?$/.test(record.name.trim());
                            const isFree = /free|one|موحد/i.test(record.name);
                            if (isNum) return <Tag color="cyan">رقمي / أحذية</Tag>;
                            if (isFree) return <Tag color="purple">مقاس موحد (Free)</Tag>;
                            return <Tag color="geekblue">ملابس قياسية (حروف)</Tag>;
                          }
                        },
                        {
                          title: 'الارتباط بالمنتجات والـ Variants',
                          dataIndex: 'usage_count',
                          key: 'usage_count',
                          sorter: (a, b) => (Number(a.usage_count) || 0) - (Number(b.usage_count) || 0),
                          render: (count) => (
                            <Tag color={Number(count) > 0 ? 'green' : 'default'} style={{ fontWeight: 700 }}>
                              {count || 0} صنف مرتبط
                            </Tag>
                          )
                        },
                        {
                          title: 'الترتيب',
                          dataIndex: 'display_order',
                          key: 'display_order',
                          width: 90,
                          sorter: (a, b) => (a.display_order || 0) - (b.display_order || 0)
                        },
                        {
                          title: 'الحالة',
                          dataIndex: 'status',
                          key: 'status',
                          width: 120,
                          render: (status, record) => (
                            <Switch
                              checkedChildren="نشط"
                              unCheckedChildren="معطل"
                              checked={status === 'active'}
                              onChange={(chk) => handleToggleStatus(record, chk)}
                            />
                          )
                        },
                        {
                          title: 'الإجراءات',
                          key: 'actions',
                          width: 140,
                          render: (_, record) => (
                            <Space size={6}>
                              <Button
                                size="small"
                                icon={<Edit3 size={13} />}
                                onClick={() => handleOpenEdit(record)}
                              >
                                تعديل
                              </Button>
                              <Popconfirm
                                title="حذف المقاس"
                                description="هل أنت متأكد من حذف هذا المقاس من النظام؟"
                                onConfirm={() => handleDeleteAttribute(record)}
                                okText="نعم"
                                cancelText="إلغاء"
                                okButtonProps={{ danger: true }}
                              >
                                <Button size="small" danger icon={<Trash2 size={13} />} />
                              </Popconfirm>
                            </Space>
                          )
                        }
                      ]}
                    />
                  </Card>
                )}
              </div>
            )
          },
          {
            key: 'matrix',
            label: (
              <Space>
                <Layers size={16} color="#d97706" />
                <span style={{ fontWeight: 700 }}>مصفوفة المطابقة والاستخدام بالمخازن</span>
              </Space>
            ),
            children: (
              <div>
                {/* Insights Summary Cards */}
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={24} md={12}>
                    <Card
                      title={
                        <Space>
                          <Palette size={16} color="#7c3aed" />
                          <span style={{ fontWeight: 700 }}>الألوان الأكثر تداولاً في المستودع</span>
                        </Space>
                      }
                      style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
                    >
                      {analytics?.topColors && analytics.topColors.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {analytics.topColors.slice(0, 5).map((tc, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Space>
                                <Tag color="purple">#{idx + 1}</Tag>
                                <Text strong>{tc.name}</Text>
                              </Space>
                              <Tag color="green" style={{ fontWeight: 700 }}>
                                {tc.count} صنف بالمخزون
                              </Tag>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty description="لا توجد بيانات استخدام كافية حتى الآن" />
                      )}
                    </Card>
                  </Col>

                  <Col xs={24} md={12}>
                    <Card
                      title={
                        <Space>
                          <Ruler size={16} color="#0284c7" />
                          <span style={{ fontWeight: 700 }}>المقاسات الأكثر تداولاً في المستودع</span>
                        </Space>
                      }
                      style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
                    >
                      {analytics?.topSizes && analytics.topSizes.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {analytics.topSizes.slice(0, 5).map((ts, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Space>
                                <Tag color="blue">#{idx + 1}</Tag>
                                <Text strong>{ts.name}</Text>
                              </Space>
                              <Tag color="cyan" style={{ fontWeight: 700 }}>
                                {ts.count} صنف بالمخزون
                              </Tag>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty description="لا توجد بيانات استخدام كافية حتى الآن" />
                      )}
                    </Card>
                  </Col>
                </Row>

                {/* Matrix Search & Variants Inspection */}
                <Card
                  title={
                    <Space>
                      <BarChart3 size={16} color="#16a34a" />
                      <span style={{ fontWeight: 700 }}>فحص ربط الأصناف والـ Variants في المخازن</span>
                    </Space>
                  }
                  style={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
                  styles={{ body: { padding: '16px' } }}
                >
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col xs={24} md={12}>
                      <Input
                        prefix={<Search size={16} color="#94A3B8" />}
                        placeholder="ابحث باسم المنتج، كود الـ SKU، اللون، أو المقاس..."
                        value={matrixSearch}
                        onChange={(e) => setMatrixSearch(e.target.value)}
                        allowClear
                      />
                    </Col>
                    <Col xs={24} md={12} style={{ textAlign: 'left' }}>
                      <Button
                        icon={<RefreshCw size={14} style={{ marginLeft: 4 }} />}
                        onClick={fetchMatrixData}
                        loading={loadingMatrix}
                      >
                        إعادة فحص الـ Variants
                      </Button>
                    </Col>
                  </Row>

                  <Table
                    dataSource={filteredMatrixVariants}
                    rowKey="id"
                    loading={loadingMatrix}
                    pagination={{ pageSize: 15 }}
                    size="small"
                    columns={[
                      {
                        title: 'اسم المنتج الأساسي',
                        dataIndex: 'product_name',
                        key: 'product_name',
                        render: (text) => <strong style={{ color: '#0F172A' }}>{text || 'غير محدد'}</strong>
                      },
                      {
                        title: 'كود الـ Variant (SKU)',
                        dataIndex: 'variant_sku',
                        key: 'variant_sku',
                        render: (sku) => (
                          <Tag style={{ fontFamily: 'monospace', fontWeight: 700, direction: 'ltr' }}>
                            {sku}
                          </Tag>
                        )
                      },
                      {
                        title: 'اللون المعين',
                        dataIndex: 'color',
                        key: 'color',
                        render: (color) => {
                          const matched = colors.find((c) => c.name.toLowerCase() === (color || '').toLowerCase());
                          return (
                            <Space size={6}>
                              {matched?.code && (
                                <div
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    backgroundColor: matched.code,
                                    border: '1px solid rgba(0,0,0,0.2)'
                                  }}
                                />
                              )}
                              <span>{color || 'بدون لون'}</span>
                            </Space>
                          );
                        }
                      },
                      {
                        title: 'المقاس المعين',
                        dataIndex: 'size',
                        key: 'size',
                        render: (size) => (
                          <Tag color="blue" style={{ fontWeight: 700 }}>
                            {size || 'بدون مقاس'}
                          </Tag>
                        )
                      },
                      {
                        title: 'الباركود',
                        dataIndex: 'barcode',
                        key: 'barcode',
                        render: (b) => <span style={{ fontFamily: 'monospace' }}>{b || '-'}</span>
                      },
                      {
                        title: 'السعر النهائي',
                        dataIndex: 'selling_price',
                        key: 'selling_price',
                        render: (p) => <span style={{ fontWeight: 700, color: '#16a34a' }}>{Number(p || 0).toFixed(2)} ج.م</span>
                      }
                    ]}
                  />
                </Card>
              </div>
            )
          }
        ]}
      />

      {/* 3. CREATE / EDIT MODAL */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
            {modalAttrType === 'color' ? <Palette size={20} color="#7c3aed" /> : <Ruler size={20} color="#0284c7" />}
            <span style={{ fontWeight: 800 }}>
              {editingAttr
                ? `تعديل ${modalAttrType === 'color' ? 'اللون' : 'المقاس'}: ${editingAttr.name}`
                : `إضافة ${modalAttrType === 'color' ? 'لون جديد للمخازن' : 'مقاس جديد للمخازن'}`}
            </span>
          </div>
        }
        open={isEditModalOpen}
        onOk={handleSaveAttribute}
        onCancel={() => setIsEditModalOpen(false)}
        confirmLoading={formSubmitting}
        okText="حفظ الخاصية"
        cancelText="إلغاء"
        destroyOnClose
        width={520}
      >
        <Form form={attrForm} layout="vertical" style={{ marginTop: 14 }}>
          <Form.Item
            name="name"
            label={modalAttrType === 'color' ? 'اسم اللون بالعربية' : 'رمز / اسم المقاس'}
            rules={[{ required: true, message: 'هذا الحقل إلزامي' }]}
            extra={
              modalAttrType === 'color'
                ? 'مثال: أسود، كحلي، زيتي، بيج، أوف وايت'
                : 'مثال: S, M, L, XL, 38, 42, Free Size'
            }
          >
            <Input placeholder={modalAttrType === 'color' ? 'مثال: بترولي' : 'مثال: 2XL'} size="large" />
          </Form.Item>

          {modalAttrType === 'color' ? (
            <div>
              <Form.Item
                name="code"
                label="الكود اللوني (Hex Code)"
                rules={[{ required: true, message: 'الكود اللوني مطلوب' }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Form.Item name="code" noStyle>
                    <ColorPicker
                      showText
                      onChange={(c) => {
                        attrForm.setFieldValue('code', c.toHexString());
                      }}
                    />
                  </Form.Item>
                  <Form.Item name="code" noStyle>
                    <Input
                      placeholder="#000000"
                      style={{ direction: 'ltr', fontFamily: 'monospace', maxWidth: 140 }}
                    />
                  </Form.Item>
                </div>
              </Form.Item>

              {/* Quick Preset Buttons for Color */}
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                  أو اختر مباشرة من درجات الألوان الشائعة:
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESET_COLOR_PALETTES.slice(0, 10).map((p, i) => (
                    <Tag
                      key={i}
                      onClick={() => {
                        attrForm.setFieldsValue({ name: p.name, code: p.code });
                      }}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px'
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: p.code,
                          border: '1px solid rgba(0,0,0,0.2)',
                          display: 'inline-block'
                        }}
                      />
                      <span>{p.name}</span>
                    </Tag>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Form.Item
              name="code"
              label="الكود المختصر (Short Code)"
              extra="رمز مختصر للمقاس يُستخدم في توليد باركودات وأكواد الصنف (مثال: S, M, L, 38)"
            >
              <Input placeholder="مثال: XL" style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="display_order" label="ترتيب العرض">
                <Input type="number" min={0} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="حالة التفعيل">
                <Select>
                  <Option value="active">نشط (متاح للاختيار)</Option>
                  <Option value="inactive">معطل (مخفي)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {editingAttr && Number(editingAttr.usage_count) > 0 && (
            <Form.Item
              name="sync_variants"
              valuePropName="checked"
              style={{
                backgroundColor: '#FAF5FF',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #E9D5FF'
              }}
            >
              <Switch />
              <span style={{ marginRight: 8, fontSize: 13, fontWeight: 600, color: '#7E22CE' }}>
                تحديث اسم الخاصية تلقائياً في جميع الـ Variants الحالية ({editingAttr.usage_count} صنف)
              </span>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 4. BATCH GENERATOR WIZARD MODAL */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wand2 size={20} color="#38BDF8" />
            <span style={{ fontWeight: 800 }}>
              مولد {batchType === 'size' ? 'المقاسات' : 'الألوان'} السريع للمخازن
            </span>
          </div>
        }
        open={isBatchModalOpen}
        onOk={handleExecuteBatchAdd}
        onCancel={() => setIsBatchModalOpen(false)}
        confirmLoading={batchSubmitting}
        okText="تطبيق الإضافة المجمعة"
        cancelText="إلغاء"
        destroyOnClose
        width={560}
      >
        <div style={{ marginTop: 12 }}>
          <Alert
            message="إضافة مجمعة ذكية"
            description="يقوم هذا المعالج بإضافة حزمة كاملة من المقاسات أو الألوان بنقرة واحدة، مع التحقق التلقائي وتخطي أي عناصر مسجلة مسبقاً لتجنب التكرار."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form layout="vertical">
            <Form.Item label="نوع الخاصية المراد توليدها">
              <Select value={batchType} onChange={setBatchType}>
                <Option value="size">مقاسات (Sizes)</Option>
                <Option value="color">ألوان (Colors)</Option>
              </Select>
            </Form.Item>

            {batchType === 'size' ? (
              <>
                <Form.Item label="اختر حزمة المقاسات القياسية">
                  <Select value={batchPresetKey} onChange={setBatchPresetKey}>
                    <Option value="apparel_letters">ملابس قياسية بالحروف (XS, S, M, L, XL, 2XL, 3XL, 4XL)</Option>
                    <Option value="footwear">أحذية ومقاسات رقمية (36, 37, 38, 39, 40, 41, 42, 43, 44, 45)</Option>
                    <Option value="universal">مقاسات موحدة وحرة (Free Size, One Size)</Option>
                    <Option value="custom">إدخال قائمة مقاسات مخصصة يدوياً</Option>
                  </Select>
                </Form.Item>

                {batchPresetKey === 'custom' && (
                  <Form.Item
                    label="المقاسات المخصصة (مفصولة بفواصل أو أسطر)"
                    extra="مثال: 10, 12, 14, 16 أو 60cm, 80cm, 100cm"
                  >
                    <Input.TextArea
                      rows={4}
                      value={batchCustomInput}
                      onChange={(e) => setBatchCustomInput(e.target.value)}
                      placeholder="أدخل المقاسات هنا..."
                    />
                  </Form.Item>
                )}
              </>
            ) : (
              <div>
                <Paragraph style={{ color: '#475569', fontSize: 13 }}>
                  سيتم توليد باليت الألوان الأساسية للملابس والمستلزمات (18 لوناً رئيسياً بأكواد Hex القياسية).
                </Paragraph>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {PRESET_COLOR_PALETTES.map((c, idx) => (
                    <Tag key={idx} style={{ padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: c.code,
                          border: '1px solid rgba(0,0,0,0.2)'
                        }}
                      />
                      <span>{c.name}</span>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Form>
        </div>
      </Modal>
    </div>
  );
}
