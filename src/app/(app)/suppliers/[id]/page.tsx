import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierActionsEditor } from "@/components/suppliers/supplier-actions-editor";
import { DeleteSupplier, SupplierForm, SupplierStages } from "@/components/suppliers/supplier-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseCustomerRequisites } from "@/domain/customer/requisites";
import { formatRub } from "@/domain/money";
import { hasRole, SUPPLIER_DELETE_ROLES } from "@/domain/user/role";
import { findSupplier } from "@/server/suppliers/list";
import { canEditSuppliers } from "@/server/suppliers/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Поставщик — BusCom ERP",
};

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;

  const supplier = await findSupplier(id);
  if (!supplier) notFound();

  const editable = canEditSuppliers(user.role);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/suppliers"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />К списку поставщиков
        </Link>
        {hasRole(user.role, SUPPLIER_DELETE_ROLES) ? (
          <DeleteSupplier supplierId={supplier.id} supplierName={supplier.name} />
        ) : null}
      </div>

      <div>
        <h1 className="font-heading text-xl font-semibold">{supplier.name}</h1>
        <p className="text-muted-foreground text-sm">
          Товаров: {supplier.products.length} · этапов в цепочке: {supplier.stages.length}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <SupplierForm
          supplierId={supplier.id}
          editable={editable}
          initial={{
            type: supplier.type,
            name: supplier.name,
            phone: supplier.phone ?? "",
            email: supplier.email ?? "",
            inn: supplier.inn ?? "",
            kpp: supplier.kpp ?? "",
            contactPerson: supplier.contactPerson ?? "",
            address: supplier.address ?? "",
            requisites: parseCustomerRequisites(supplier.requisites),
            comment: supplier.comment ?? "",
          }}
        />

        <SupplierStages
          // Ключ по составу цепочки: после сохранения форма берёт свежие id этапов с сервера.
          key={supplier.stages.map((stage) => `${stage.id}:${stage.name}`).join("|")}
          supplierId={supplier.id}
          editable={editable}
          initial={supplier.stages.map((stage) => ({
            id: stage.id,
            key: stage.id,
            name: stage.name,
            ordersCount: stage._count.tracks,
          }))}
        />

        <div className="lg:col-span-2">
          <SupplierActionsEditor supplierId={supplier.id} editable={editable} initial={supplier.enabledActions} />
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Товары поставщика</h2>
        {supplier.products.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Товаров пока нет. Поставщика привязывают к товару в его карточке, в разделе «Товары».
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Артикул</TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-32 text-right">Закупка</TableHead>
                  <TableHead className="w-32 text-right">Продажа</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplier.products.map(({ product, purchasePriceKopecks }) => (
                  <TableRow key={product.id} className={product.isActive ? undefined : "opacity-60"}>
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRub(purchasePriceKopecks)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRub(product.priceKopecks)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  );
}
