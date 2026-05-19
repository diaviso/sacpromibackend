import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCustomerOrderItemDto {
  @ApiProperty({ description: 'ID du produit fini' })
  @IsUUID()
  finishedProductId!: string;

  @ApiProperty({ example: 50 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantityOrdered!: number;

  @ApiPropertyOptional({ description: 'Prix unitaire négocié (sinon prix gros/détail du client)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPrice?: number;
}

export class CreateCustomerOrderDto {
  @ApiProperty({ description: 'ID du client' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: '2026-04-30' })
  @IsDateString()
  orderDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [CreateCustomerOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerOrderItemDto)
  items!: CreateCustomerOrderItemDto[];
}
