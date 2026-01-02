import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Payrolls from '../Payrolls';
import * as api from '../../utils/api';

jest.mock('../../utils/api');

describe('Payrolls page', () => {
    beforeEach(() => {
        api.branchesAPI.getAll.mockResolvedValue({ data: { success: true, data: [{ id: 1, branch_name: 'Branch A' }] } });
    });

    test('renders and loads branches', async () => {
        render(<Payrolls />);
        await waitFor(() => expect(api.branchesAPI.getAll).toHaveBeenCalled());
        expect(screen.getByText('المسيرات')).toBeInTheDocument();
    });

    test('shows confirmation modal when exporting large list', async () => {
        // Mock employeesAPI to return a large list
        const largeList = Array.from({ length: 600 }, (_, i) => ({ id: i + 1, first_name: 'Test', data_completion_status: 'complete' }));
        api.employeesAPI.getAll.mockResolvedValue({ data: { success: true, data: largeList } });

        render(<Payrolls />);
        await waitFor(() => expect(api.branchesAPI.getAll).toHaveBeenCalled());

        // Open branch dropdown and select branch
        const branchToggle = screen.getByText('اختر فرعاً');
        fireEvent.click(branchToggle);
        await waitFor(() => screen.getByText('Branch A'));
        fireEvent.click(screen.getByText('Branch A'));

        // Click preview to load employees
        const previewBtn = screen.getByText('عرض المعاينة');
        fireEvent.click(previewBtn);

        // Wait for preview to load
        await waitFor(() => expect(api.employeesAPI.getAll).toHaveBeenCalled());

        // Click generate - should show confirmation because size > 500
        const genBtn = screen.getByText('توليد PDF');
        fireEvent.click(genBtn);

        expect(await screen.findByText(/تأكيد التصدير/)).toBeInTheDocument();
    });
